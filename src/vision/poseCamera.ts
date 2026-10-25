import type { MagicAction } from './magicGesture';
import type { BodyGestureEvent, BodyTracking } from './bodyGestures';
import { FALLBACK_MODEL_URL, MODEL_URL, WASM_ROOT } from './poseAssets';

export type TrackingStatus =
  | 'idle'
  | 'requesting'
  | 'loading'
  | 'tracking'
  | 'missing'
  | 'denied'
  | 'error';
export type PoseCameraOptions = {
  onAction: (action: MagicAction) => void;
  onStatus: (status: TrackingStatus) => void;
  onGesture?: (event: BodyGestureEvent) => void;
  onTracking?: (tracking: BodyTracking) => void;
  /** Bitmap is valid only during this callback; the controller closes it afterward. */
  onDebug?: (frame: ImageBitmap | null) => void;
  wasmRoot?: string;
  modelUrl?: string;
};
export type PoseWorkerReply =
  | { type: 'ready' }
  | { type: 'error'; reason?: string }
  | {
      type: 'pose';
      event: BodyGestureEvent | null;
      tracking: BodyTracking;
      debugFrame?: ImageBitmap;
    };

/** One worker + one in-flight bitmap per camera. `start()` is safe to call once on mount. */
export function createPoseCamera(
  video: HTMLVideoElement,
  options: PoseCameraOptions,
) {
  let generation = 0;
  let active = false;
  let stream: MediaStream | null = null;
  let worker: Worker | null = null;
  let frame = 0;
  let watchdog: ReturnType<typeof setTimeout> | undefined;
  let debugEnabled = false;
  let lastStatus: TrackingStatus = 'idle';
  const status = (next: TrackingStatus) => {
    if (next !== lastStatus) {
      lastStatus = next;
      options.onStatus(next);
    }
  };
  const stop = () => {
    generation++;
    active = false;
    cancelAnimationFrame(frame);
    clearTimeout(watchdog);
    stream?.getTracks().forEach((track) => {
      track.onended = null;
      track.onmute = null;
      track.stop();
    });
    stream = null;
    video.srcObject = null;
    // terminate also releases the worker's WASM heap/canvas/model, including a hung load/inference.
    worker?.terminate();
    worker = null;
    options.onDebug?.(null);
    status('idle');
  };
  const setDebug = (enabled: boolean) => {
    debugEnabled = enabled;
    worker?.postMessage({ type: 'debug', enabled });
    if (!enabled) options.onDebug?.(null);
  };
  const fail = (next: TrackingStatus = 'error') => {
    stop();
    status(next);
  };
  const armWatchdog = (ms: number) => {
    clearTimeout(watchdog);
    watchdog = setTimeout(() => fail(), ms);
  };
  const start = async () => {
    if (active) return;
    active = true;
    const run = ++generation;
    status('requesting');
    // Permission may be left unanswered. Late-granted streams are still stopped below.
    armWatchdog(30000);
    try {
      if (!navigator.mediaDevices?.getUserMedia)
        throw new Error('Camera unavailable');
      const acquired = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: 'user',
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
      });
      if (run !== generation) {
        acquired.getTracks().forEach((track) => track.stop());
        return;
      }
      stream = acquired;
      stream.getTracks().forEach((track) => {
        track.onended = () => fail();
        track.onmute = () => {
          worker?.postMessage({ type: 'resetPending' });
          status('missing');
        };
      });
      video.srcObject = stream;
      await video.play();
      if (run !== generation) return;
      status('loading');
      armWatchdog(30000);
      const detector = new Worker(
        new URL('./pose.worker.ts', import.meta.url),
        { type: 'module' },
      );
      worker = detector;
      let ready = false;
      let busy = false;
      let lastInference = -Infinity;
      let lastVideoTime = -1;
      detector.onerror = (error) => {
        if (run === generation) {
          if (import.meta.env.DEV)
            console.warn('Pose worker could not start:', error.message);
          fail();
        }
      };
      detector.onmessage = ({ data }: MessageEvent<PoseWorkerReply>) => {
        if (run !== generation) {
          if (data.type === 'pose') data.debugFrame?.close();
          return;
        }
        if (data.type === 'error') {
          if (import.meta.env.DEV)
            console.warn('Pose model unavailable:', data.reason);
          fail();
          return;
        }
        armWatchdog(10000);
        if (data.type === 'ready') {
          ready = true;
          status('missing');
          return;
        }
        busy = false;
        status(data.tracking.upperBody ? 'tracking' : 'missing');
        try {
          if (debugEnabled && data.debugFrame)
            options.onDebug?.(data.debugFrame);
        } finally {
          data.debugFrame?.close();
        }
        options.onTracking?.(data.tracking);
        if (data.event) {
          options.onGesture?.(data.event);
          if (data.event.type === 'HAND_RAISE')
            options.onAction({ type: 'MAGIC_ACTIVATE' });
        }
      };
      detector.postMessage({
        type: 'init',
        wasmRoot: options.wasmRoot ?? WASM_ROOT,
        modelUrl: options.modelUrl ?? MODEL_URL,
        fallbackModelUrl: options.modelUrl ? undefined : FALLBACK_MODEL_URL,
      });
      if (debugEnabled) detector.postMessage({ type: 'debug', enabled: true });
      const tick = (now: number) => {
        if (run !== generation) return;
        if (
          ready &&
          !busy &&
          video.readyState >= 2 &&
          video.currentTime !== lastVideoTime &&
          now - lastInference >= 100
        ) {
          busy = true;
          lastInference = now;
          lastVideoTime = video.currentTime;
          // Transfer locally to the worker; never queue frames or send to a server.
          void createImageBitmap(video)
            .then((bitmap) => {
              if (run !== generation) {
                bitmap.close();
                return;
              }
              try {
                detector.postMessage({ type: 'frame', bitmap, at: now }, [
                  bitmap,
                ]);
              } catch {
                bitmap.close();
                fail();
              }
            })
            .catch(() => {
              if (run === generation) fail();
            });
        }
        frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    } catch (error) {
      if (run !== generation) return;
      fail(
        error instanceof DOMException && error.name === 'NotAllowedError'
          ? 'denied'
          : 'error',
      );
    }
  };
  return { start, stop, setDebug };
}
