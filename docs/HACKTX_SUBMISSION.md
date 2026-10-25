# StoryMotion — HackTX 2026 submission notes

> Draft for the team's Devpost entry. Everything under "Verified" was actually run on
> 2026-10-24 on branch `feat/raju-gesture`. Items marked **MANUAL** still need a human.
> No deployed URL exists yet. The Devpost submission has **not** been made.

## Name and tagline

**StoryMotion** — *Step into the story: a living picture book that kids steer with their whole body.*

## Problem

Children's stories are usually something kids sit and watch. Screen time is mostly
passive, and "active" games often demand constant exercise or fast reflexes that young
or less-mobile children can't keep up with. We wanted a story that keeps playing like a
cartoon, but invites a child, now and then, to *help* the characters with one simple,
playful movement.

## What it does

- **An animated story that plays by itself.** *The Tortoise and the Hare* runs as a
  ~42-second animated short: title card, the race, Hare's nap, Tortoise's steady
  finish, confetti, and the moral. If the child does nothing, it still plays to the end.
- **Two optional "help the hero" moments.**
  1. *Which way should we go?* Lean left or right to pick the shady or sunny trail, or
     raise a hand for a sparkly speed boost.
  2. *Whoosh! A gust of leaves!* Spread your arms to make a magic shield the leaves
     bounce off, or duck while they fly overhead.
- **Five one-shot body gestures**, detected on the device from the laptop webcam:
  HAND_RAISE, LEAN_LEFT, LEAN_RIGHT, ARMS_WIDE, CROUCH. Each fires once per intentional
  movement. The detector needs the pose held briefly, checks which joints are visible,
  waits for the child to return to neutral, and applies a cooldown.
- **Every gesture has a big button too.** Seated play works: only crouch needs visible
  legs. Camera setup never uses up an invitation window: it is postponed, and skipped if
  setup takes too long, so the story never stalls.
- **Privacy by design.** Video frames go to an in-browser Web Worker and are discarded.
  No recording, no uploads, no accounts, no personal data.

## How we built it

| Layer | What we used |
|---|---|
| App | React 19 + TypeScript + Vite |
| Story engine | Pure reducer (`src/engine/automaticStory.ts`): time-driven story with optional interaction windows, independent of camera, model, or landmarks |
| Animation | Original code-drawn SVG art in parallax layers (`src/rendering/forest/`), moved by a `requestAnimationFrame` loop that writes transforms directly (no React re-render per frame), CSS keyframe character rigs, and a dependency-free canvas particle system |
| Pose detection | Google MediaPipe Pose Landmarker (lite, float16) via `@mediapipe/tasks-vision` 1.1.1, in VIDEO mode, inside a module Web Worker with one frame in flight (about 10 inferences/s) |
| Gesture logic | Pure, unit-tested detector (`src/vision/bodyGestures.ts`): body-relative measurements, smoothing, calibration, mirroring, visibility gating, one-shot latch, neutral rearm, cooldown |
| Sound | Browser speech synthesis for narration, plus original sound effects synthesized with Web Audio (no audio files) |
| Testing | Vitest + React Testing Library (78 tests), plus a dependency-free Chrome DevTools Protocol smoke test (`scripts/browser-smoke.mjs`) that runs the real MediaPipe model on a public test image |

## Key features actually implemented

- Full animated Tortoise & Hare scene: 7 parallax layers, a camera with pans, cuts and
  gentle zoom, and title, transition and ending overlays.
- Character animation: Tortoise walk cycle, breathing, blinking, head nods, cheer, and
  tucking into its shell. Hare hops, brags, glances back, yawns, sleeps (with Zzz),
  wakes up startled, and cheers. A forest crowd celebrates at the finish.
- Gesture-triggered effects: magic sparkle burst and speed trail, a shimmering shield
  bubble with physical leaf bounce, duck animation, trail choice with lighting changes,
  and leaves turning into sparkles.
- Gesture effects follow the character the child chose (Tortoise or Hare).
- Camera: explicit Start/Stop, small mirrored preview, status messages, a handled
  "permission denied" state, cleanup on stop, page hide, or leaving the page, and an
  opt-in skeleton overlay (`?debugPose=1`).
- Pause (freezes story, effects and narration), restart, mute, narration replay, and a
  fullscreen "cinema mode".
- Responsive layout from phone width to 1080p fullscreen. Vector art stays sharp at
  any pixel density. Reduced-motion support.

## Challenges (real ones we hit)

1. **MediaPipe in a module worker failed with `ModuleFactory not set`.** The default
   WASM loader in the installed 1.1.1 package doesn't register its factory when
   dynamically imported from a module worker. Using the package's ES-module loader
   variant (`forVisionTasks(root, true)`) fixed it without moving inference back onto
   the UI thread.
2. **The camera worked once, then "could not start".** The Vite dev server only
   discovered MediaPipe when the worker first imported it, re-bundled its dependencies
   mid-session, and answered the worker's import with HTTP 504. Pre-bundling it
   (`optimizeDeps.include`) fixed it.
3. **Slow model downloads stalled camera setup.** Downloads from Google storage
   measured under 1.3 MB per 40 s on our network, tripping our 30 s loading watchdog.
   We now serve the model from the app itself, with the official URL as a fallback.
4. **One-shot gestures are harder than detection.** Raw landmarks jitter, children are
   different sizes and distances from the camera, and losing sight of the hips can make
   a lean look "released". We measure relative to shoulder width, require a short
   stable hold, need a visible return to neutral before rearming, and never let lost
   tracking count as neutral.
5. **Smooth animation with React.** Re-rendering React at 60 fps would be wasteful. The
   story clock ticks 5× per second, and a single animation-frame loop interpolates
   between ticks and writes transforms directly. It also holds position briefly so
   characters never step backwards when a tick lands.

## Verified on 2026-10-24 (automated / headless)

| Check | Result |
|---|---|
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm test` | PASS: 78 tests in 17 files |
| `npm run build` | PASS |
| `node scripts/browser-smoke.mjs` (dev and production preview) | PASS: real MediaPipe inference returned 33 landmarks from a public test image streamed as fake camera video; manual magic, skeleton overlay, pause/resume/replay, 390 px layout, camera stop, automatic completion, legacy route |
| Animation frame rate | about 61 animation frames/s measured in headless Chrome at 1440×900, 2× pixel ratio (not a guarantee on every laptop) |

## Not yet verified (MANUAL)

- Real webcam gesture accuracy with a real person (each of the 5 gestures, false
  triggers, seated play). Must be done on the demo MacBook.
- Safari and Firefox behavior. Only Chrome was tested.
- Audio: speech and sound effects were not listened to in this session.
- Any public deployment. The camera requires HTTPS or localhost.

## What we learned

- **Pose estimation:** landmarks are noisy and depend on scale. Gestures become reliable
  only with body-relative thresholds, smoothing, visibility checks, and a state machine
  (stable hold, latch, neutral rearm, cooldown) on top of the raw model.
- **Browser workers:** moving synchronous inference off the UI thread kept the
  animation smooth, but worker module loading, WASM factories, and dev-server bundling
  each caused failures that mocked unit tests could not catch. That's why we added a
  real-browser smoke test.
- **Real-time interaction design:** the story must never wait on hardware. Making
  invitations optional, time-boxed, and postponed during setup made the experience
  both inclusive and demo-safe.
- **Animation:** separating "what time is it in the story" (a pure, testable timeline)
  from "draw it" (DOM/canvas) let us unit-test choreography, e.g. that Tortoise always
  wins and the camera never jumps.

## Future improvements

- *Jack and the Beanstalk* (14 scenes) and *The Three Little Pigs* (12 scenes, one
  continuous story, wheat → stone → brick, with an on-screen Wolf) are now complete
  scene-based stories; next would be curated illustrated art for them.
- Calibrate thresholds from real playtests with children, with consent and without
  recording.
- Family mode prompts for a parent and child to choose together.
- Optional curated illustrated art and recorded narration, with recorded provenance.

## Prize-track alignment (confirm eligibility on Devpost before selecting)

- **Most Entertaining (primary):** a cartoon you can *join*: shields, sparkles, trail
  choices, confetti, a sleeping Hare, a cheering crowd.
- **Best Overall:** real computer vision in a worker, a tested gesture state machine,
  a deterministic story engine, and polished original art. It works end-to-end without
  a camera too.
- **Best Pitch:** the 90-second script below is built around one live "wow" moment.
- **Best Novice:** only if the team meets the official novice definition. Do not
  assume eligibility.
- We did **not** add sponsor APIs just to qualify for more tracks. No Meta, or other
  sponsor, model is used in this build.

## Honest AI and asset disclosure

- **AI coding assistants:** OpenAI Codex and Anthropic Claude Code wrote most of the
  code under the team's direction and review. The team made product decisions and must
  perform the physical testing.
- **Image generation:** none. All story art (forest, characters, crowd, effects) is
  original SVG/CSS/canvas drawn in code. There are no stock or AI-generated images or
  videos.
- **Sound:** narration uses the browser's built-in speech voices. Sound effects are
  synthesized live with Web Audio; there are no audio files.
- **Third-party model:** Google MediaPipe Pose Landmarker Lite. Source, checksum and
  license note are in `docs/ASSET_MANIFEST.md`.
- **Fonts:** Fredoka and Nunito from Google Fonts.

## 90-second demo script

| Time | On screen | Say |
|---|---|---|
| 0:00–0:12 | Home page → library | "Stories usually ask kids to sit still. StoryMotion is a cartoon you can step into, using just a laptop webcam." |
| 0:12–0:25 | Pick Tortoise → Let's Go; title card; Hare dashes off | "It plays like an animated short. No controller, no account, and nothing is recorded." |
| 0:25–0:35 | Allow the camera prompt so tracking says "Camera ready" | "The camera runs Google's MediaPipe pose model in a background worker, right here in the browser." |
| 0:35–0:50 | Moment 1: volunteer **leans right**; sunny trail and sparkles | "At special moments the story invites you to help. Lean, and Tortoise takes the sunny trail. One movement, one reaction: it won't re-trigger until you return to neutral." |
| 0:50–1:05 | Moment 2: volunteer **spreads arms**; shield bubble, leaves bounce off | "A gust of leaves! Arms wide makes a shield. Ducking or a button works too, so seated kids can play." |
| 1:05–1:15 | Hare wakes; Tortoise wins; confetti; moral card | "And if you do nothing, the story simply continues. No one is left behind." |
| 1:15–1:30 | Point at the architecture or README | "React and TypeScript, a pure story engine, on-device pose detection in a Web Worker, and hand-built animation, with automated tests and a real-browser check. Thank you!" |

Fallbacks during the demo: if the camera misbehaves, use the on-screen buttons. They
trigger exactly the same animations. Practice once with **Restart story** (toolbar)
so the moments line up with the script.

## Devpost readiness checklist

- [ ] Rules and deadlines re-checked on https://hacktx26.devpost.com/rules (final
      submissions close Oct 25, 2026, 11:30 AM CDT per the team's notes)
- [ ] Repository public, with the latest work merged/pushed by the team (nothing has
      been committed or pushed by the assistant)
- [ ] README explains setup, privacy, and demo steps (`README.md`)
- [ ] Demo video recorded with consenting adults only; no identifiable children
- [ ] Screenshots: title card, gesture moment with camera preview, shield with leaves,
      finish confetti, ending card
- [ ] Description pasted from this document and edited by the team
- [ ] Actual team members added on Devpost
- [ ] Prize tracks selected only where eligible (check track limits and novice rules)
- [ ] Deployed HTTPS URL tested in a fresh browser (optional; localhost demo works)
- [ ] In-person judging: demo laptop charged, Chrome updated, camera permission
      pre-granted, good lighting, 2–3 m of floor space, sound tested
- [ ] MacBook webcam gesture check completed (see `docs/GESTURE_QA.md`)
