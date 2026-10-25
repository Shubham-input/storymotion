# Automatic stories and local body gestures

Current implementation lives on `feat/raju-gesture`. The primary experience is now
`/library/hare/play`, not the separate camera practice page. No commits, pushes,
or merges were performed. Existing story registry, session context, framework,
shared global styles, and legacy exercise components are preserved.

## Run

1. `npm ci` if dependencies are absent.
2. `npm run dev` and open the printed localhost URL.
3. Start Adventure → choose a story → choose a character → Let's Go.
4. The animated story starts immediately. Camera access is optional; click
   Allow the camera prompt when the story opens; **Start Camera** retries it. Old `/camera` URLs redirect
   to the player, so they no longer show simulated permission success.

Production: `npm run build`, then `npm run preview`. Both the main app and
`/gesture-demo.html` are included. The latter is a hand-raise diagnostic companion;
all five body gestures are integrated into the **main player**.

## Story behavior

Each story has a short, authored 42-second demo arc rendered with inline SVG and
CSS. No external story videos, character/background art, or audio files exist in
this checkout; there are no invented media URLs. SVG animation and captions work
without those assets. Browser speech synthesis is best effort; mute and Replay
narration control it. If speech is unavailable or blocked by browser autoplay
policy, captions and story timing still work. No video autoplay permission is
needed for the browser-rendered story animation.

An optional interaction opens after ten seconds, with **twelve seconds** to respond.
One action is enough; holding/repeating it is unnecessary. Each choice has a button.
If nothing happens, the story finishes automatically. Camera permission/model
loading defers an unopened invitation, or resets an open invitation, without
stopping narrative time. After setup settles (success or failure), the invitation
gets its full twelve seconds. A still-loading camera cannot hold the ending open;
if setup lasts the whole story, replay when ready. An invitation already open near
the ending gets its remaining response time before completion.

Pause freezes story time and animations and ignores gesture events. Switching tabs
pauses the story and stops the camera. Restart resets story effects and timing;
stopping/restarting the camera also resets calibration. Exit/completion/unmount
stops camera tracks and terminates the worker.

## Supported gestures

| Gesture | Story response / button | Recognition and availability |
|---|---|---|
| `HAND_RAISE` | Magic boost / Activate Magic | Either visible wrist above its shoulder; shoulders establish body scale |
| `LEAN_LEFT` | Shady path / Left path | Shoulder midpoint relative to hips; shoulder tilt fallback for cropped seated users |
| `LEAN_RIGHT` | Sunny path / Right path | Same detector, mapped to the mirrored preview |
| `ARMS_WIDE` | Protective bubble / Shield | Both wrists extended sideways, near shoulder height, with elbows nearly straight |
| `CROUCH` | Brief duck animation / Duck | Visible hips, knees, ankles, and an automatically acquired straight-legged standing baseline |

The detector accepts MediaPipe's 33 normalized landmarks and checks the visibility
of the joints needed for each gesture. Head orientation is a coarse nose/ears-based
left/forward/right estimate only when those landmarks are reliable; it is not a
story trigger. Missing legs disable camera crouch while upper-body play and **all
buttons** remain available. Starting seated never establishes a crouch baseline.

Calibration happens from about 600 ms of a steady relaxed upper-body pose. If needed,
the panel says “Relax your arms for a moment.” Standing calibration happens separately
when enough lower-body landmarks are visible. No calibration wizard or forced
standing is required. Stop/start the camera after significantly changing its position.

Measurements are shoulder-scale-relative, smoothed with a scalar exponential filter,
and require 400 ms stability. A global one-shot latch prevents repeated triggers;
the relevant joints must visibly return to neutral for 300 ms, with a 1100 ms cooldown.
Gaps over 350 ms cancel pending recognition. Occlusion never serves as neutral,
including when the hips used for a lean disappear. These heuristics need physical
MacBook testing and tuning across heights, clothing, lighting, and camera distances.

## Architecture and integration contract

- `src/vision/bodyGestures.ts`: pure full-body measurement, calibration, smoothing,
  visibility, classification, stability, cooldown, and neutral-rearm logic.
- `src/vision/pose.worker.ts`: installed `@mediapipe/tasks-vision` Pose Landmarker,
  CPU delegate, VIDEO mode, one pose, no segmentation. It releases each ImageBitmap
  after inference. Only derived tracking status, landmark **count**, and gesture events
  leave the worker; raw landmark arrays do not. Explicit developer mode can additionally transfer a temporary skeleton bitmap, which is closed immediately after local drawing.
- `src/vision/poseCamera.ts`: explicit `start()`/`stop()`, camera lifecycle, at most
  ten frame transfers/sec, one in-flight frame, worker cleanup, and 30-second setup /
  10-second stalled-inference watchdogs. Unsupported worker/canvas environments use
  the manual fallback rather than moving expensive inference onto the UI thread.
- `GestureCamera`: preview, start/stop, friendly tracking/calibration/leg availability,
  last recognized gesture, unmount/page-hide cleanup.
- `automaticStoryReducer`: independent timeline and optional-action gate. All five
  button actions and camera events reach the same reducer.
- `AnimatedStoryScene`: always-available SVG animation and gesture effects.

`onAction({ type: 'MAGIC_ACTIVATE' })` is preserved for existing hand-raise consumers.
The optional `onGesture({ type: 'HAND_RAISE' | 'LEAN_LEFT' | 'LEAN_RIGHT' | 'ARMS_WIDE' |
'CROUCH' })` callback reports all five recognitions. If subscribing to both, do not
handle `HAND_RAISE` twice: the player sends it through `onAction` and filters it out
of `onGesture`. Both callbacks carry events only, never landmarks. `onTracking`
provides availability/calibration metadata. The older pure `magicGesture.ts`
state machine remains compatible but the runtime now uses `bodyGestures.ts`.

The preview is mirrored; classifier direction mapping is also mirrored. Optional
skeleton rendering is available by adding `?debugPose=1` to the main player URL, then
opening **Developer tracking** and checking **Show skeleton**. It starts unchecked;
normal player URLs expose no developer controls. Visible joints and their MediaPipe
indices are drawn over the preview, with readable labels and mirrored geometry.

`poseDebug.ts` renders these diagnostic pixels in the worker. Landmark arrays never
leave the worker. The temporary bitmap is closed after drawing (or on a stale reply),
and the overlay clears on disable/stop/exit. No frames or landmarks are recorded,
uploaded, or saved. The low-level controller exposes `setDebug(boolean)` and `onDebug`;
its bitmap is valid only during that callback. Debug rendering failures cannot stop
pose recognition. This optional mode helps human calibration checks.

Shared files requiring teammate coordination: `StoryPlayerPage`, `PlayerToolbar`,
`PauseDialog`, `CharacterSelectPage`, `CameraSetupPage`, their tests, two home help/copy
components, and `vite.config.ts`'s second HTML entry. The new script/renderer/reducer
are modular; no changes were made to the existing registry, exercise content/schema,
router path definitions, or session state. The old exercise components remain unused
by this new automatic player for the teammate to reconcile later.

## Assets, privacy, and the worker fix

Runtime URLs are centralized in `poseAssets.ts`: jsDelivr's **1.1.1** WASM runtime
and Google's Pose Landmarker Lite float16 **revision 1**. Initial downloads require
network access; failure never blocks the story. No frames or landmarks are recorded,
uploaded, logged, or persisted. Calibration/smoothed scalar measurements exist only in
memory and disappear when the worker is terminated. No microphone is requested.

The browser initially failed with **`ModuleFactory not set.`** The installed 1.1.1
bundle's task constructor checks `self.ModuleFactory`. The default classic WASM
loader defines its factory locally when imported from an ES-module worker. This is
not a missing model, CORS failure, or broken Vite worker URL. The installed API's
`FilesetResolver.forVisionTasks(wasmRoot, true)` selects the ES-module loader, whose
source registers `globalThis.ModuleFactory`. That one argument fixes initialization;
`PoseLandmarker.createFromOptions(...)` remains the documented API. A regression test
asserts ES-module selection, VIDEO configuration, frame cleanup, and error reporting.

References: [official Web guide](https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker/web_js),
[FilesetResolver API](https://ai.google.dev/edge/api/mediapipe/js/tasks-vision.filesetresolver),
and the installed `node_modules/@mediapipe/tasks-vision/vision.d.ts` `useModule` declaration.
See [GESTURE_QA.md](./GESTURE_QA.md) for actual validation results and manual checks.
