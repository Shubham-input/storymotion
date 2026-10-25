# StoryMotion

An animated children's story (ages ~5–10) that plays by itself and lets kids, now and
then, help the characters with one simple body movement detected by the webcam:
raise a hand, lean left or right, spread their arms, or duck. Every movement also
has a button, and nothing is ever required: if the child just watches, the story
plays to the end.

Built for HackTX 2026. The demo story is **The Tortoise and the Hare**.

## Run it

```sh
npm install
npm run dev        # open the printed localhost URL in Chrome
```

Story → **The Tortoise and the Hare** → pick a character → **Let's Go**. Allow the
optional camera prompt, stand or sit 2–3 m back, and relax your arms for a second.
If permission is dismissed or denied, the story still works and **Start Camera** retries it.
Two invitations appear during the story: _pick a trail_ (lean or raise a hand) and
_gust of leaves_ (spread your arms or duck). The ⤢ button opens cinema mode.

Developer skeleton overlay: add `?debugPose=1` to the player URL.

### Generate Gemini narration

Put `GEMINI_API_KEY=...` in `.env.local`, preview the work with
`npm run generate:narration:dry`, then run `npm run generate:narration`. Generated
WAV files are served locally with no runtime API calls; browser speech remains the
fallback. See `docs/GEMINI_NARRATION.md` for resumable and per-story options.

## Checks

```sh
npm run typecheck && npm run lint && npm test && npm run build
node scripts/browser-smoke.mjs http://127.0.0.1:5173   # with the dev server running
```

The smoke test drives Chrome headless and runs the real pose model on a public test
image. It does not use a physical webcam.

## Privacy

Camera frames are processed in a Web Worker on the device and discarded immediately.
Nothing is recorded, saved, or uploaded. There are no accounts and no personal data.

## How it works

- `src/engine/automaticStory.ts`: pure story timeline with optional interaction moments
- `src/rendering/forest/`: parallax SVG scene, character rigs, camera choreography,
  canvas particles
- `src/vision/`: camera controller, pose worker (MediaPipe Pose Landmarker), and the
  unit-tested one-shot gesture detector
- `src/audio/sfx.ts`: tiny original sound effects synthesized with Web Audio
- `scripts/generate-narration.mjs`: resumable offline Gemini TTS generation

More: `docs/HACKTX_SUBMISSION.md`, `docs/GESTURE_FEATURE.md`, `docs/GESTURE_QA.md`,
`docs/GEMINI_NARRATION.md`.
