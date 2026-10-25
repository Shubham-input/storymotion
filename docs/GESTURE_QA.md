# Gesture integration audit and verification — 2026-10-24

## Confirmed problems and fixes

1. **Clapperboard was hard-coded**, not a failed video. No story media exists beyond
   favicon/icons and empty asset folders. Replaced the player placeholder with animated
   SVG story scenes; no speculative asset path or media download is used.
2. **Player and camera were disconnected.** Camera setup simulated permission with a
   timer. Character selection now enters the real automatic player, which mounts the
   local camera. Legacy setup URLs redirect. The earlier exercise-counting flow is no
   longer the active player.
3. **Replay/mute had no speech implementation.** Added optional browser speech synthesis,
   captions, cancellation on pause/unmount, and functional replay/mute controls.
4. **The practice window began at mount and could expire during setup.** Both player and
   practice page use the shared timeline; the optional 12-second window is deferred or
   reset during camera setup. The narrative never waits on camera/model/landmarks.
5. **Synchronous inference ran on the rendering thread.** Moved detection into a local
   worker with at most one bitmap in flight, explicit disposal, and stalled-load/inference
   watchdogs. Camera failures preserve manual controls and automatic continuation.
6. **Worker initialization failed in Chrome with `ModuleFactory not set.`** Confirmed the
   throw in the installed dependency, and inspected both WASM loader scripts. The classic
   loader does not register its factory globally when dynamically imported in a module
   worker; the ES6 loader does. Fixed with `forVisionTasks(wasmRoot, true)`. No package
   upgrade, framework change, or main-thread fallback was needed.
7. **TS2353 in camera mocks** came from obsolete `{pose, at}` replies after the worker
   contract became `{event, tracking}`. Fixtures now use the real `PoseWorkerReply` and
   metadata shape, including landmark count; no type-safety suppression was added.
8. **Body scale and partial visibility needed stronger handling.** Full-body recognition
   now uses calibrated body-relative measurements and smoothing, per-joint visibility,
   mirrored direction mapping, a one-shot latch, cooldown, and visible neutral rearming.
   Crouch is unavailable without visible legs plus a standing baseline. Losing the hips
   that established a lean cannot silently rearm that lean.

## Browser checks actually performed

Mac headless Chrome, against Vite development and production preview. Chrome's fake
camera was used only to exercise permission handling. Google's public
[pose test image](https://storage.googleapis.com/mediapipe-assets/pose.jpg) was decoded
locally and streamed through `canvas.captureStream()` as test video. This is **not a
physical webcam or human gesture accuracy test**.

Confirmed:

- Home → library → character → player navigation; no simulated setup screen.
- Explicit permission request, nonzero video dimensions, working live synthetic preview.
- Actual installed MediaPipe model inference in VIDEO mode returned **33 landmarks**.
- Production worker requests returned **HTTP 200** for all three resources:
  `vision_wasm_module_internal.js`, `vision_wasm_module_internal.wasm`, and
  `pose_landmarker_lite.task` (pinned URLs in `poseAssets.ts`).
- Manual magic changes the story scene; pause freezes character position;
  resume and restart work; responsive layout has no horizontal overflow at 390 px.
- Stop Camera clears the stream. Story finishes without input. Legacy `/camera`
  navigates into `/play`. No uncaught browser exceptions.
- Desktop screenshot inspected: actual SVG Tortoise/Hare scene, live test preview,
  captions, and labeled controls render correctly.

MediaPipe emitted nonfatal runtime warnings about feedback tensors/OpenGL checking and
normalized rectangles, while successfully returning 33 landmarks. These are not reported
as inference failures. Network availability is still required for initial model/runtime
loading. No claim is made about offline model loading.

Run the browser check after starting dev or preview:

```sh
node scripts/browser-smoke.mjs http://127.0.0.1:5173
# or, after npm run build and npm run preview:
node scripts/browser-smoke.mjs http://127.0.0.1:4173
```

The script uses native Chrome DevTools Protocol (no added npm dependency), a temporary
Chrome profile, and an explicitly synthetic feed. It downloads the public test image;
no real camera footage is used or saved. Chrome must be installed at its normal Mac path.

## MacBook manual check — still required

1. Run `npm run dev`. In Chrome, open the printed **localhost** URL, then choose
   Tortoise and Hare → Tortoise → Let's Go. Verify it animates and ends without input.
2. Replay. Allow the browser camera prompt (or use **Start Camera** to retry), and allow Chrome
   in macOS **System Settings → Privacy & Security → Camera** if necessary. No microphone
   permission is needed. Expect your live preview, then Camera ready/Looking for you.
3. Sit or stand comfortably with shoulders and hands visible, arms relaxed briefly.
   Wait for upper-body readiness. During the invitation, briefly raise either hand,
   then relax it. Expect one magic boost. Holding the hand up must not repeat it.
4. Replay for each other action: gently lean toward your left/right in the mirrored
   preview; open both arms sideways; optionally gently bend your knees if already
   standing with hips, knees, and ankles visible. Expect the corresponding path,
   shield, or brief duck. Do not perform repeated exercises. Return to neutral before
   another gesture; use replay to test a fresh story invitation.
5. Sit with legs out of view. Crouch should be unavailable; upper-body gestures and
   the Duck button still work. Try every button with the camera off.
6. Start camera during an invitation or delay the permission response. The story
   continues; the invitation receives a fresh twelve seconds after setup settles.
   If setup takes the entire story, the ending still appears; replay for another try.
7. Try denial, stopping while loading, turning off/revoking the camera, leaving the
   frame and returning in the same held pose, hiding the tab, and leaving the page.
   Check the camera indicator turns off on Stop/exit. A pending permission prompt
   cannot be dismissed programmatically, but any late-granted stream is stopped.
8. Test pause, replay, narration sound/replay, keyboard controls, and your actual
   browser/OS/device performance. Report missed/duplicate actions, framing/distance,
   lighting, and browser version. Do not record children or send camera footage.

Remaining limitations: synthetic fixtures validate logic and inference, not real-child
accuracy; Safari and physical MacBook gestures still need testing. Body heuristics need
practical tuning. No authored video files or curated art/audio were supplied; the SVG
stories are the working fallback. The full original story graph/choices remain outside
this short demo. The optional skeleton overlay is hidden behind `?debugPose=1` plus an explicit checkbox; physical alignment still needs a human camera test.

## Final automated results

| Check | Result |
|---|---|
| `npm run typecheck` | PASS; TS2353 resolved |
| `npm run lint` | PASS; no errors or warnings |
| `npm test` | PASS; 68 tests across 15 files |
| `npm run build` | PASS; main app, worker, and practice entry emitted |
| Browser smoke — Vite development | PASS; real inference from test video returned 33 landmarks |
| Browser smoke — production preview | PASS; 33 landmarks, all three asset responses HTTP 200, no uncaught exceptions |
| `git diff --check` | PASS |
| Physical gestures / Safari | NOT VERIFIED; manual check required |

Unit/component coverage includes all five gestures, both wrists, mirrored left/right,
calibration, smoothing/stability, body-relative scale, head visibility, missing legs,
seated starting posture, neutral/cooldown behavior, hip-occlusion rearming, missing
landmarks, worker API configuration/inference failures, denied permission, cleanup,
late permission/bitmap resolution, timeouts, all five button/event story responses,
pause/restart, setup-safe window timing, and automatic completion for all three stories.

## Files changed in this feature branch work

- Vision: `src/vision/{magicGesture,bodyGestures,poseAssets,poseCamera,pose.worker,poseDebug}.ts`.
- Camera/demo UI: `src/components/gesture/{GestureCamera,MagicGestureDemo}.tsx`,
  `gestureCamera.css`, `gestureDemo.css`; `src/gesture-demo.tsx`, `gesture-demo.html`.
- Story integration: `src/components/player/{StoryPlayerPage,PlayerToolbar,PauseDialog}.tsx`,
  `automaticStory.css`; `src/engine/automaticStory.ts`, `src/data/stories/animatedBeats.ts`,
  `src/rendering/AnimatedStoryScene.tsx`, `src/hooks/useNarration.ts`.
- Navigation/help: `src/components/characters/CharacterSelectPage.tsx`,
  `src/components/camera/CameraSetupPage.tsx`, `src/components/home/{Hero,HowItWorksModal}.tsx`.
- Tests: `src/tests/{magicGesture,bodyGestures,poseCamera,poseWorker,automaticStory}.test.ts`,
  `src/tests/{MagicGestureDemo,GestureCamera,StoryPlayerPage}.test.tsx`.
- Validation/build: `scripts/browser-smoke.mjs`, `vite.config.ts`.
- Documentation: `docs/{BUILD_STATUS,ASSET_MANIFEST,GESTURE_FEATURE,GESTURE_QA}.md`.

Shared-file coordination and callback compatibility are documented in `GESTURE_FEATURE.md`.
The existing `package.json`, lockfile, story registry, global styling, and session/router
contracts were not changed. No commit, push, merge, or destructive Git operation was run.


## Full-body requirement follow-up

All five requested gestures and their main-story/button integrations were already
present and retained. The follow-up added a developer-only skeleton preview and fixed
a stale status message that incorrectly said upper-body play was ready after tracking
was lost. Only the camera feature, its tests/browser check, and documentation changed
in this follow-up; the story player and navigation needed no additional modifications.

For physical testing, open `/library/hare/play?debugPose=1`, start the camera, expand
**Developer tracking**, and check **Show skeleton**. Check that the skeleton follows
your mirrored preview; disable it and confirm the canvas clears. Default URLs show
no developer controls. Index labels identify MediaPipe landmarks (shoulders 11/12,
elbows 13/14, wrists 15/16, hips 23/24, knees 25/26, ankles 27/28).

New regression coverage verifies default-off diagnostics, visibility filtering, bitmap
transfer/disposal including late replies, checkbox gating, unmount cleanup, and correct
status when upper/lower-body availability changes. The production browser check now
also requires visible skeleton pixels from actual model output and an empty canvas
after disabling the overlay. Physical gesture accuracy remains unverified.

Follow-up production browser result: **PASS**. Real test-video inference returned 33
landmarks; default mode emitted no diagnostic frames; explicit developer mode rendered
visible skeleton pixels and cleared them on disable. Pause/replay, mobile layout,
camera stop, no-input story completion, and legacy route navigation passed with no
uncaught exceptions. This used synthetic/public test video, not a physical webcam.


## Claude Code handoff audit — 2026-10-24

Reproduced the previously reported problems before changing code. On arrival:
typecheck, lint, 68 tests, build, and the dev browser smoke test all **passed** —
the `ModuleFactory not set` worker failure and TS2353 `pose` fixture error were
already fixed by Codex.

Repeated smoke runs exposed two intermittent failures, both traced (not guessed):

1. **Story finished during cold model load.** Page text at timeout showed the
   completion screen: the 42 s story correctly does not wait for the camera, so the
   camera unmounted mid-check. Fix (test only): the smoke script pauses the story
   while waiting for inference, then resumes. Pausing freezes story time only.
2. **Model download from storage.googleapis.com stalled** (measured <1.3 MB in 40 s
   with curl), tripping the 30 s loading watchdog; the app showed its graceful
   "camera could not start" message and the story stayed playable. Fix: model
   self-hosted at `public/models/pose_landmarker_lite.task`, official URL kept as an
   automatic worker-side fallback (unit tested).

Also fixed: in Tortoise & Hare, gesture effects (shield, duck, lean, sparkle) always
applied to the Tortoise even when the child chose Hare. They now follow the chosen
character (regression test `AnimatedStoryScene.test.tsx`).

After fixes: typecheck PASS, lint PASS, 71 tests / 16 files PASS, build PASS, dev
smoke 3/3 PASS, production-preview smoke 1/1 PASS — all with 33 real landmarks and the
model served same-origin. The smoke script still downloads its *test image* from
Google storage, so it can fail on a bad network before reaching the app.
Physical webcam gestures: **MANUAL_REQUIRED** (not run).


## Final build pass — 2026-10-24

- **Reproduced and fixed:** `Pose worker could not start` in the dev server (also seen in
  a real browser session). Vite answered the worker's MediaPipe import with **504
  Outdated Optimize Dep**: MediaPipe is imported only by the worker, so Vite discovered
  it late and re-bundled mid-session. Running two dev servers on one `node_modules/.vite`
  cache made it worse. Fix: `optimizeDeps: { include: ['@mediapipe/tasks-vision'] }`.
  Production builds were not affected. **Restart any running dev server** to pick it up.
- The story now has two optional moments. The checklist below supersedes the
  single-window steps above.

### MacBook webcam checklist (MANUAL — not run by Claude)

1. `npm run dev`, then open the localhost URL in Chrome → Tortoise & Hare → Tortoise →
   Let's Go → allow the camera prompt. Stand 2–3 m back with your shoulders and hands in
   view, arms relaxed for about 1 s ("Camera ready").
2. Moment 1 (~9 s, "Which way should we go?"): lean right and hold for about half a
   second. Expect the "Right path chosen!" banner, a warm light tint, sparkles, and the
   Tortoise shifting lane. Replay (toolbar) and repeat for lean left and hand raise
   (speed boost and sparkle trail).
3. Moment 2 (~21 s, "Whoosh! A gust of leaves!"): spread your arms wide (elbows
   straight, hands at shoulder height). Expect the shield bubble with leaves bouncing
   off it. Replay and try crouch (whole body visible) for the duck animation.
4. Do nothing for a full run: the story must finish on its own.
5. For each gesture, record hits out of 5 tries and any false triggers (for example,
   arm-swinging setting off shield). Report back for threshold tuning.
