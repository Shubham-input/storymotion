# BUILD_STATUS

Last updated: 2026-10-24 (automatic story + body gesture integration)

## Current phase

**CURRENT — Automatic animated story + local full-body gestures implemented. Physical-camera validation remains required.**

See the current integration report at the end of this file and `GESTURE_QA.md`.
The Phase 01/02 and initial isolated-camera notes below are historical.

## Historical Phase 01/02 snapshot

### Phase 01 (scaffold) — unchanged, see git history for detail
Vite + React 19 + TS, pixi.js v8, @mediapipe/tasks-vision, zod,
react-router-dom, lucide-react; vitest/RTL/ESLint/prettier; design tokens;
typed router; ErrorBoundary; `.env.example`; full directory skeleton.

### Phase 02 additions

- **Session state** (`src/app/SessionContext.tsx`): in-memory-only `mode`
  ('solo'/'family'), `characterId`, `audioEnabled` — no persistence, no
  account, per CLAUDE.md §8.
- **Story data registry** (`src/data/stories/registry.ts`): all 3 stories
  (hare, beanstalk, pigs) with title, theme, teaser, moral, badge, and
  character rosters. CSS-gradient `coverBackground` placeholders stand in
  for real art.
- **Demo beat content** (`src/data/stories/demoBeats.ts`): one sample
  narration → choice → reaction → challenge sequence per story, explicitly
  marked as temporary Phase 02 demo content, NOT the authored Phase 06
  script.
- **Home** (`components/home/{HomePage,Hero,ModeSelect,HowItWorksModal}.tsx`):
  hero section, Solo/Family mode toggle (persists via session), "How It
  Works" accessible modal, audio on/off toggle, privacy note.
- **Story Library** (`components/library/{StoryLibraryPage,StoryGrid,
  StoryCard,StoryNotFound}.tsx`): all 3 stories always shown/unlocked,
  current-mode banner with a "Change" link back to Home. `StoryNotFound`
  is the shared fallback for any invalid `:storyId` route param.
- **Character Select** (`components/characters/{CharacterSelectPage,
  CharacterPicker,CharacterCard}.tsx`): per-story roster, family-mode
  "pick together" prompt, selection required before "Let's Go" enables.
- **Camera Setup** (`components/camera/{CameraSetupPage,CameraSetup,
  CameraPreview,PoseStatus}.tsx`): full interaction shell (idle → requesting
  → granted/denied/skipped) driven by a **simulated** timer, not a real
  `getUserMedia()` call — that's explicitly Phase 05. "Play without camera"
  always available; safety/privacy copy shown.
- **Story Player shell** (`components/player/{StoryPlayerPage,
  PlayerToolbar,NarrationPanel,DialoguePanel,ChoicePanel,ChallengePanel,
  PauseDialog}.tsx`): toolbar (mute/restart/pause), a demo narration→choice→
  reaction→challenge flow, manual "I did it!" rep counting (the permanent
  manual-mode path per CLAUDE.md §0 rule 6), and a Pause Dialog that freezes
  rep-counting and choice input while open.
- **Completion** (`components/completion/{CompletionPage,RewardBadge}.tsx`):
  moral line, badge, family-mode reflection prompt, "Play Again" /
  "Choose Another Story" CTAs.
- **Shared a11y infrastructure**: `components/layout/Modal.tsx` (focus trap,
  Escape-to-close, focus restore on close — used by both Pause Dialog and
  How-It-Works) and `components/layout/ProgressBar.tsx` (`role="progressbar"`
  with `aria-valuenow`/`aria-valuetext` + a visually-hidden live-region
  announcement).

## Historical Phase 02 omissions (superseded where noted below)

- No story engine / state machine / Zod schema (Phase 03) — the Player's
  narration→choice→challenge flow is local `useState` demo wiring, not the
  typed `StoryBeat` graph from CLAUDE.md §8.
- No PixiJS scene rendering (Phase 04) — all "scenes" are CSS gradient boxes
  with an emoji.
- No camera / MediaPipe pose detection (Phase 05) — Camera Setup is fully
  simulated.
- Only `hare`'s first challenge/choice has demo content; `beanstalk`/`pigs`
  use the same demo pattern but not their full authored 4-challenge arcs
  (Phase 06).
- No Meta AI integration (Phase 07), no deployment (Phase 09), no curated art
  (ART-01/02/03 still open, not blocking).
- No git commits for this phase yet until this report is reviewed (committing
  now).

## TESTS (actually run, this session)

| Command | Result |
|---|---|
| `npm run typecheck` | PASS |
| `npm run lint` | PASS (0 errors, 0 warnings) |
| `npm run build` | PASS (339 KB JS / 107 KB gzip, 4.9 KB CSS) |
| `npm test` | PASS (14/14 across 8 test files) |

Test files added this phase: `ModeSelect`, `Modal` (focus trap/Escape/focus
restore), `ProgressBar` (ARIA values + live-region text, clamping),
`ChallengePanel` (manual rep button → Continue swap), `CharacterSelectPage`
(disabled-until-selected + not-found fallback), `StoryPlayerPage`
(narration→choice→challenge flow, pause freezes counting + focus restore),
`CompletionPage` (family reflection shown only in family mode).

**Not run:** a real visual browser click-through. The Claude-in-Chrome
extension was not connected in this session, so I could not personally watch
the app render. I confirmed the dev server serves every route with HTTP 200
and relied on the RTL test suite (real jsdom rendering + real click/keyboard
events) for interaction coverage. A human visual pass is still worth doing.

## MANUAL TEST (click-through — for the human to actually run)

1. `npm run dev`, open the printed local URL.
2. Home: toggle Solo/Family, open "How It Works" (check Escape closes it and
   focus returns to the button that opened it), toggle Sound On/Off, click
   "Start Adventure".
3. Story Library: see all 3 cards with the current mode banner; click any
   story's "Start This Story".
4. Character Select: "Let's Go" is disabled until you click a character card
   (in Family mode you'll also see a "pick together" banner); click a
   character, then "Let's Go".
5. Camera Setup: click "Allow Camera" → see a brief "Requesting…" then a
   placeholder preview; or click "Play without camera" instead. Either way,
   "Continue" becomes enabled.
6. Story Player: click through Continue → pick a choice → Continue → tap
   "I did it!" repeatedly until the progress bar fills → Continue. Try the
   pause (⏸) button mid-challenge: confirm the rep button is no longer
   reachable, "Resume" closes the dialog and refocuses the pause button.
7. Completion: see the moral, badge, and (Family mode only) the reflection
   prompt; try both "Play This Story Again" and "Choose Another Story".
8. Try an invalid URL like `/library/nope/characters` — should show the
   friendly "couldn't find that story" screen, not a crash.

## NEXT

**Phase 03 — Story schema, state engine, test fixtures.** Implement the real
`StoryBeat`/`Story`/`MovementEvent` types and Zod schema from CLAUDE.md §8,
the pure state-machine reducer, and replace the Phase 02 demo `useState`
flow in `StoryPlayerPage` with it. No blocker.

## Historical camera feature branch — initial optional magic slice (2026-10-24)

`feat/raju-gesture` now includes an isolated real-camera demo at
`/gesture-demo.html`. The older “no camera / MediaPipe” status above remains
true only of the shared story screens: those simulated screens were left
unchanged for the integration owner.

The current product decision supersedes the earlier exercise gates: stories
progress automatically and gestures are optional, occasional interactions.
This slice supplies a reusable local Pose Landmarker camera controller,
400 ms stable either-hand raise detection, one-shot `MAGIC_ACTIVATE` events,
visible lowering to rearm, cooldown, manual activation through the same
callback, and an independent eight-second automatic continuation demo.
Camera start is click-only; stop, unmount, tab hiding, errors, and late async
resource completion clean up tracks/models. No video/landmark persistence
or uploads are implemented. The versioned model/runtime downloads require
network access; failure leaves manual interaction and continuation available.

Validation actually run on this branch:

| Command | Result |
|---|---|
| `npm run typecheck` | PASS |
| `npm run lint` | PASS (no errors or warnings) |
| `npm test` | PASS (28 tests across 11 files) |
| `npm run build` | PASS (includes `dist/gesture-demo.html`) |
| `git diff --check` | PASS |

Physical camera gestures and visual browser testing: **MANUAL REQUIRED**.
Instructions, model sources, thresholds, limitations, and integration contract
are in [GESTURE_FEATURE.md](./GESTURE_FEATURE.md). No commits, pushes, or merges
were made. Next camera task: physical laptop verification, then teammate-owned
integration of optional events into the automatically progressing story engine.


## Current integration and stabilization — feat/raju-gesture

The main story player now uses a camera-independent automatic timeline and animated
SVG scenes for all three stories. The hard-coded clapperboard and repeated exercise
requirements are gone from the active player. Existing registry/session architecture
and legacy components remain preserved. Character selection goes straight to play;
legacy camera URLs redirect to the player. Camera permission is requested when the
player opens, with an in-player Start Camera retry. Captions, optional browser narration, pause,
replay, manual action controls, and automatic completion are implemented.

The optional twelve-second invitation is deferred/reset during camera setup, while
narrative time continues. Five gestures are recognized by a modular calibrated detector:
HAND_RAISE (also MAGIC_ACTIVATE for compatibility), LEAN_LEFT, LEAN_RIGHT, ARMS_WIDE,
and CROUCH. Each has a matching button and story response. Missing legs disable only
camera crouch; seated play does not block the story. Calibration, scalar smoothing,
visibility, mirrored directions, stable recognition, neutral rearming, and cooldown
are covered by synthetic tests. Inference runs in a local worker with one frame in
flight; no camera data or landmark arrays are uploaded or persisted.

A real browser check caught a MediaPipe initialization bug that mocks had missed:
`ModuleFactory not set.` The installed 1.1.1 package needs the ES-module WASM files
inside an ES-module worker. The minimal fix is `forVisionTasks(wasmRoot, true)`.
Both dev and production browser runs have since returned 33 landmarks from Google's
public pose image streamed as test video. Production requests for loader, WASM, and
model returned HTTP 200. The obsolete camera-test fixture shape was corrected without
disabling TypeScript checks.

Full implementation/contract: [GESTURE_FEATURE.md](./GESTURE_FEATURE.md).
Audit, actual validation, browser script, and MacBook manual checks:
[GESTURE_QA.md](./GESTURE_QA.md).

No real webcam gestures, child accuracy, or Safari behavior have been physically verified.
No curated story video/art/audio exists; inline SVG is the functional fallback. No
commits, pushes, or merges were made. Next: human MacBook gesture calibration checks
and teammate review of the shared player/navigation changes.

Final validation: typecheck PASS, lint PASS, 68 tests / 15 files PASS, production build
PASS, development and production Chrome smoke tests PASS with real 33-landmark inference
from public test video, and `git diff --check` PASS. Physical webcam gestures and Safari
remain NOT VERIFIED. Detailed evidence and limitations are recorded in `GESTURE_QA.md`.


Full-body follow-up: all five optional gestures remain integrated. Added an explicitly
opt-in local skeleton overlay (`?debugPose=1` → Developer tracking → Show skeleton),
with transient bitmap cleanup and visible-joint filtering. Fixed stale upper-body
readiness text after tracking disappears. Typecheck, lint, 68 tests across 15 files,
and the production build pass. Physical gestures still require MacBook testing.


## Claude Code handoff session — 2026-10-24

Audited Codex's uncommitted work; all validation already passed on arrival. Fixed a
smoke-test race with automatic story completion, self-hosted the pose model (remote
host was stalling camera setup), and made Tortoise & Hare gesture effects follow the
chosen character. Results: typecheck/lint/71 tests/build PASS; dev + production smoke
PASS with real 33-landmark inference (synthetic video). Physical MacBook webcam
gesture check: MANUAL_REQUIRED. Details: `GESTURE_QA.md` (last section). No commits.


## Final HackTX build pass — 2026-10-24 (Claude Code)

**Shipped on `feat/raju-gesture` (uncommitted):**
- Fixed: the camera worker failed to start under the Vite dev server (MediaPipe dependency
  discovered late → HTTP 504 on the worker's import). Fix: `optimizeDeps.include`.
- Tortoise & Hare is now a cinematic scene (`src/rendering/forest/`): parallax
  layers, camera choreography, character rigs, canvas particles, title, fade
  transition, and ending card. The other two stories keep the simpler SVG scenes.
- Two optional interaction moments (`MOMENTS` in `src/engine/automaticStory.ts`):
  *pick a trail* (9 s) and *gust of leaves* (21 s). Camera setup postpones a moment,
  and a moment the setup outlasts is skipped, so it can never run over the ending.
- Original Web Audio sound effects that follow the mute toggle (`src/audio/sfx.ts`),
  fullscreen cinema mode, an invitation banner overlaid on the scene's sky for wide
  layouts, and caption fade-in.
- Docs: `README.md`, `docs/HACKTX_SUBMISSION.md` (Devpost text, demo script, checklist).

**Validation actually run:** typecheck PASS, lint PASS, 78 tests / 17 files PASS,
build PASS, browser smoke (dev and production preview) PASS with 33-landmark real
inference on a synthetic feed. Headless screenshots inspected at 1440×900 (2× pixel
ratio), 1280×800, and 390 px, with no horizontal overflow and about 61 animation
frames/s in headless Chrome.

**MANUAL_REQUIRED:** physical webcam gestures on the demo MacBook, listening to the
audio, and Safari/Firefox. No deployment exists.


## Story completeness pass — 2026-10-25 (Claude Code, `feat/raju-gesture`, uncommitted)

Teammate feedback: stories lacked introductions/conclusions, Jack was missing key plot
events, the Pigs were three separate character experiences, and the Wolf was not on
screen. Fixed by making every story an explicit, ordered scene list:

- **Single plot source:** `src/data/stories/scenes.ts` — scene id, chapter title,
  narration, visible cast, plot events and optional moments. The engine
  (`automaticStory.ts` SCRIPTS), captions, narration line ids, chapter label and the
  renderers all look up the same active scene. Moment prompts/reactions moved to
  `src/data/stories/momentCopy.ts`.
- **Jack and the Beanstalk (14 scenes):** Jack/Mother/Milky-White intro → mother sends
  the cow to market for vegetables → trader trades magic beans for the cow (rope and
  beans visibly change hands) → mother upset, tosses beans into the garden, night →
  beanstalk grows (legacy tall-world renderer reused) → climb → clouds/castle → Giant
  stomps in → golden hen lays a golden egg → Giant sleeps, Jack thinks of his hungry
  mother and takes the hen → hen clucks, Giant wakes, notices, chases → escape down
  the swaying beanstalk with the Giant's boots following → Mother brings the axe, the
  Giant climbs back up, beanstalk falls → ending with sharing and a lesson about
  choices. Optional: HAND_RAISE grow, LEAN dodge, ARMS_WIDE protect.
- **The Three Little Pigs (12 scenes, one story, one "character" entry → no picker):**
  Mama Pig goodbye → wheat house → visible animated Wolf → huff/puff, wheat house
  collapses, pig 1 flees → stone house (no door, leafy roof: the believable weakness)
  → Wolf blows through the doorway, roof flies off, pigs slip out the back → brick
  house → reunion, door slams → climax, house stands → last trick: chimney, lid,
  slide, splash into the rain barrel → Wolf runs off for good → celebration + moral.
  Optional: HAND_RAISE last brick, ARMS_WIDE brace.
- **Tortoise and the Hare:** kept its renderer; added an introduction and a separate
  challenge scene by holding the forest picture at the start line for 13 s
  (`forestTime()`); ending card now also says "The End — Adventure Complete!".
- **Renderer:** `src/rendering/storybook/` — posable SVG rigs (Mother, Cow, Trader,
  Giant/GiantLegs, Golden Hen, three Pigs + Mama, Wolf), sets (cottage, market road,
  castle hall, descent, countryside, wheat/stone/brick houses with build/collapse
  states), camera zoom/shake, scene fades, title/end cards, and per-scene sound cues.
- **Sound:** 34 short synthesized Web Audio story cues in `src/audio/sfx.ts` (moo,
  thump, cluck, chop, crash, inhale/blow, brick, splash…); no audio files or licenses.
- **Menus:** story cards show the full cast (Giant, golden hen, Wolf, the story's own
  pigs); completion screen shows "The End — Adventure Complete!" and the ending cast.

**Validation actually run:** typecheck PASS, lint PASS (0 warnings), 153 tests / 20
files PASS (new `storyCompleteness.test.tsx`: required plot events in order,
intro/conclusion, narration fits scene length, invitations wait for narration, renderer
coverage, renderer shows the narrated characters/states, camera-off autoplay of every
scene in order with captions/picture in sync; narration spoken once per scene), build
PASS. Headless Chrome (DevTools protocol) screenshots of every Jack and Pigs scene and
the Hare intro at 1280×800; both new stories autoplayed to the completion page with
no input. Real-webcam gestures: NOT VERIFIED (MANUAL_REQUIRED). Audio cues: NOT
LISTENED TO by a human (MANUAL_REQUIRED). No commits, pushes or merges.
