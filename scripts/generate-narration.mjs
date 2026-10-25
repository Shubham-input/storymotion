#!/usr/bin/env node

import { GoogleGenAI } from "@google/genai";
import {
  readFile,
  mkdir,
  rename,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { loadEnvFile } from "node:process";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { STORY_SCENES } from "../src/data/stories/scenes.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT_ROOT = join(ROOT, "public", "audio", "narration");
const MANIFEST_FILE = join(
  ROOT,
  "src",
  "data",
  "stories",
  "generatedNarrationManifest.ts",
);
const STORY_IDS = ["hare", "beanstalk", "pigs"];
const DEFAULT_MODEL = "gemini-3.8-flash-lite-tts";
const DEFAULT_VOICE = "Kore";
const DEFAULT_DELAY_MS = 12_000;
const REQUEST_TIMEOUT_MS = 90_000;
const MAX_ATTEMPTS = 5;

try {
  loadEnvFile(join(ROOT, ".env.local"));
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

function valueFor(name) {
  const exact = process.argv.indexOf(name);
  if (exact >= 0) return process.argv[exact + 1];
  return process.argv
    .find((value) => value.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

function integerOption(name, fallback) {
  const raw = valueFor(name);
  if (raw === undefined) return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0)
    throw new Error(`${name} must be a non-negative integer.`);
  return parsed;
}

const dryRun = process.argv.includes("--dry-run");
const force = process.argv.includes("--force");
const requestedStory = valueFor("--story") ?? "all";
const model =
  valueFor("--model") ?? process.env.GEMINI_TTS_MODEL ?? DEFAULT_MODEL;
const voice =
  valueFor("--voice") ?? process.env.GEMINI_TTS_VOICE ?? DEFAULT_VOICE;
const delayMs = integerOption(
  "--delay-ms",
  Number(process.env.GEMINI_TTS_DELAY_MS ?? DEFAULT_DELAY_MS),
);
const limit = integerOption("--limit", Number.POSITIVE_INFINITY);

if (requestedStory !== "all" && !STORY_IDS.includes(requestedStory)) {
  throw new Error(`--story must be one of: all, ${STORY_IDS.join(", ")}.`);
}
if (!dryRun && !process.env.GEMINI_API_KEY) {
  throw new Error(
    "GEMINI_API_KEY is missing. Add it to .env.local, then run this command again.",
  );
}

const selectedStories = requestedStory === "all" ? STORY_IDS : [requestedStory];
const jobs = selectedStories
  .flatMap((storyId) =>
    STORY_SCENES[storyId].map((scene, index) => ({ storyId, scene, index })),
  )
  .slice(0, limit);

function outputPath(job) {
  const number = String(job.index).padStart(2, "0");
  return join(OUTPUT_ROOT, job.storyId, `${number}-${job.scene.id}.wav`);
}

function publicUrl(job) {
  const number = String(job.index).padStart(2, "0");
  return `/audio/narration/${job.storyId}/${number}-${job.scene.id}.wav`;
}

function styleFor(storyId, scene) {
  const storyDirection = {
    hare: "Warm, playful, energetic storybook narration with gentle comedy.",
    beanstalk:
      "Warm, magical storybook narration with wonder and child-safe suspense.",
    pigs: "Warm, playful storybook narration with rhythmic energy and reassuring suspense.",
  }[storyId];
  return `${storyDirection} Read the supplied transcript verbatim. Scene: ${scene.title}. Clear diction, natural pauses, and a friendly pace for young children.`;
}

function wait(ms) {
  return new Promise((resolveWait) => setTimeout(resolveWait, ms));
}

function retryable(error) {
  const status = Number(error?.status ?? error?.code);
  const message = error instanceof Error ? error.message : String(error);
  // A daily Free Tier cap cannot recover during exponential backoff. Stop now;
  // the resumable command can be rerun after the reset shown by Gemini.
  if (/requests per day|per day on Free Tier|retry in \d+h/i.test(message))
    return false;
  return (
    status === 429 ||
    status >= 500 ||
    /429|RESOURCE_EXHAUSTED|rate.?limit/i.test(message)
  );
}

async function createAudio(ai, job) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const interaction = await ai.interactions.create(
      {
        model,
        input: [
          {
            type: "user_input",
            content: [
              {
                type: "text",
                text: job.scene.narration,
                annotations: [
                  {
                    type: "speech_metadata",
                    style: styleFor(job.storyId, job.scene),
                  },
                ],
              },
            ],
          },
        ],
        response_format: { type: "audio", mime_type: "audio/wav" },
        generation_config: { speech_config: [{ voice }] },
        store: false,
      },
      { signal: controller.signal },
    );
    const output = interaction.output_audio;
    if (!output?.data) throw new Error("Gemini returned no audio data.");
    const bytes = Buffer.from(output.data, "base64");
    if (bytes.length < 44 || bytes.toString("ascii", 0, 4) !== "RIFF")
      throw new Error("Gemini returned an invalid WAV file.");
    return bytes;
  } finally {
    clearTimeout(timeout);
  }
}

async function generateWithRetry(ai, job) {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await createAudio(ai, job);
    } catch (error) {
      if (!retryable(error) || attempt === MAX_ATTEMPTS) throw error;
      const backoff = Math.max(delayMs, 15_000 * 2 ** (attempt - 1));
      console.warn(
        `  Rate limited or unavailable; retrying in ${Math.ceil(backoff / 1000)}s…`,
      );
      await wait(backoff);
    }
  }
  throw new Error("Narration generation exhausted its retries.");
}

async function validWav(path) {
  try {
    const info = await stat(path);
    if (info.size < 44) return false;
    const bytes = await readFile(path);
    return bytes.toString("ascii", 0, 4) === "RIFF";
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

function wavDurationMs(bytes) {
  if (bytes.length < 44 || bytes.toString("ascii", 0, 4) !== "RIFF")
    return null;
  let offset = 12;
  let byteRate = 0;
  let dataSize = 0;
  while (offset + 8 <= bytes.length) {
    const id = bytes.toString("ascii", offset, offset + 4);
    const size = bytes.readUInt32LE(offset + 4);
    if (id === "fmt " && size >= 12) byteRate = bytes.readUInt32LE(offset + 16);
    if (id === "data") {
      dataSize = size;
      break;
    }
    offset += 8 + size + (size % 2);
  }
  return byteRate && dataSize ? Math.round((dataSize / byteRate) * 1000) : null;
}

async function writeAudio(path, bytes) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.partial`;
  await writeFile(temporary, bytes);
  try {
    await rename(temporary, path);
  } catch (error) {
    await unlink(temporary).catch(() => {});
    throw error;
  }
}

async function writeManifest() {
  const entries = {};
  for (const storyId of STORY_IDS) {
    for (const [index, scene] of STORY_SCENES[storyId].entries()) {
      const job = { storyId, scene, index };
      const path = outputPath(job);
      if (!(await validWav(path))) continue;
      const bytes = await readFile(path);
      entries[`${storyId}:${scene.id}`] = {
        url: publicUrl(job),
        text: scene.narration,
        durationMs: wavDurationMs(bytes),
        model,
        voice,
      };
    }
  }
  const source = [
    "/** Generated by `npm run generate:narration`. Do not edit by hand. */",
    `export const generatedNarrationManifest = ${JSON.stringify(entries, null, 2)} as const;`,
    "",
  ].join("\n");
  await writeFile(MANIFEST_FILE, source);
  return Object.keys(entries).length;
}

console.log(
  `Gemini narration: ${jobs.length} scene(s), ${model}, voice ${voice}`,
);
console.log(
  `Mode: ${dryRun ? "dry run (no API calls)" : force ? "regenerate" : "resume"}`,
);
if (dryRun) {
  for (const job of jobs)
    console.log(
      `  ${job.storyId}/${job.scene.id} → ${relative(ROOT, outputPath(job))}`,
    );
  console.log("Dry run complete. No files or API quota were used.");
  process.exit(0);
}

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
let generated = 0;
let skipped = 0;
let failed = null;
for (const [position, job] of jobs.entries()) {
  const path = outputPath(job);
  if (!force && (await validWav(path))) {
    skipped++;
    console.log(
      `[${position + 1}/${jobs.length}] Skip ${job.storyId}/${job.scene.id}`,
    );
    continue;
  }
  console.log(
    `[${position + 1}/${jobs.length}] Generate ${job.storyId}/${job.scene.id}`,
  );
  try {
    const bytes = await generateWithRetry(ai, job);
    await writeAudio(path, bytes);
    generated++;
  } catch (error) {
    failed = error;
    console.error(`Generation stopped at ${job.storyId}/${job.scene.id}:`);
    console.error(error instanceof Error ? error.message : error);
    break;
  }
  if (position < jobs.length - 1 && delayMs > 0) await wait(delayMs);
}

const available = await writeManifest();
console.log(
  `Finished: ${generated} generated, ${skipped} skipped, ${available} available.`,
);
if (failed) {
  console.log(
    "Run the same command again later; completed files will be skipped.",
  );
  process.exitCode = 1;
}
