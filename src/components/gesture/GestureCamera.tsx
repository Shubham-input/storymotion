import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { createPoseCamera } from '../../vision/poseCamera';
import type { TrackingStatus } from '../../vision/poseCamera';
import type {
  BodyGesture,
  BodyGestureEvent,
  BodyTracking,
} from '../../vision/bodyGestures';
import type { MagicAction } from '../../vision/magicGesture';
import { playSfx } from '../../audio/sfx';
import './gestureCamera.css';

const messages: Record<TrackingStatus, string> = {
  idle: 'Camera off. The story buttons work too!',
  requesting: 'Ask a grown-up to allow the camera.',
  loading: 'Getting the camera ready… You can keep watching.',
  tracking: 'Camera ready ✓',
  missing: 'Move into view so we can see you.',
  denied: 'No camera? No problem — tap the story buttons instead.',
  error:
    'The camera took a nap. Try again, or tap the story buttons instead.',
};

const ALMOST: Record<BodyGesture, string> = {
  HAND_RAISE: 'Hand going up… almost there!',
  LEAN_LEFT: 'Leaning… almost there!',
  LEAN_RIGHT: 'Leaning… almost there!',
  ARMS_WIDE: 'Arms opening… almost there!',
  CROUCH: 'Ducking… almost there!',
};

export function GestureCamera({
  onAction,
  onGesture,
  onStatusChange,
  onPending,
}: {
  onAction: (action: MagicAction) => void;
  onGesture?: (event: BodyGestureEvent) => void;
  onStatusChange?: (status: TrackingStatus) => void;
  /** The gesture being recognized right now, or null. Changes only, not per frame. */
  onPending?: (gesture: BodyGesture | null) => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const overlay = useRef<HTMLCanvasElement>(null);
  const [showSkeleton, setShowSkeleton] = useState(false);
  const developerMode =
    new URLSearchParams(window.location.search).get('debugPose') === '1';
  const controller = useRef<ReturnType<typeof createPoseCamera> | null>(null);
  const [status, setStatus] = useState<TrackingStatus>('idle');
  const [tracking, setTracking] = useState<BodyTracking | null>(null);
  const [recognized, setRecognized] = useState('');
  const [fps, setFps] = useState(0);
  const emit = useEffectEvent(onAction);
  const pending = useEffectEvent((next: BodyGesture | null) =>
    onPending?.(next),
  );
  const gesture = useEffectEvent((event: BodyGestureEvent) => {
    const labels = {
      HAND_RAISE: 'Hand raised!',
      LEAN_LEFT: 'Leaning left!',
      LEAN_RIGHT: 'Leaning right!',
      ARMS_WIDE: 'Arms wide — a shield!',
      CROUCH: 'A gentle duck!',
    };
    setRecognized(`✨ ${labels[event.type]}`);
    playSfx('recognized');
    onGesture?.(event);
  });
  const reportStatus = useEffectEvent((next: TrackingStatus) => {
    // Camera cues on real transitions only (status changes, never per frame).
    if (next === 'missing' && status === 'loading') playSfx('cameraOn');
    if (next === 'idle' && ['loading', 'tracking', 'missing'].includes(status))
      playSfx('cameraOff');
    setStatus(next);
    if (next === 'idle' || next === 'requesting') {
      setTracking(null);
      setRecognized('');
      pending(null);
    }
    onStatusChange?.(next);
  });
  useEffect(() => {
    let mounted = true;
    let lastPending: BodyGesture | null = null;
    let frames = 0;
    let windowStart = performance.now();
    const camera = createPoseCamera(video.current!, {
      onAction: (action) => emit(action),
      onGesture: (event) => {
        if (mounted) gesture(event);
      },
      onDebug: (frame) => {
        const canvas = overlay.current;
        if (!mounted || !canvas) return;
        const context = canvas.getContext('2d');
        if (!context) return;
        if (!frame) {
          context.clearRect(0, 0, canvas.width, canvas.height);
          return;
        }
        canvas.width = frame.width;
        canvas.height = frame.height;
        context.drawImage(frame, 0, 0);
      },
      onTracking: (next) => {
        if (!mounted) return;
        setTracking(next);
        const now = performance.now();
        frames++;
        if (now - windowStart >= 1000) {
          setFps(Math.round((frames * 1000) / (now - windowStart)));
          frames = 0;
          windowStart = now;
        }
        const current = next.pending ?? null;
        if (current !== lastPending) {
          lastPending = current;
          pending(current);
        }
      },
      onStatus: (next) => {
        if (mounted) reportStatus(next);
      },
    });
    controller.current = camera;
    const stop = () => camera.stop();
    const hide = () => {
      if (document.hidden) stop();
    };
    window.addEventListener('pagehide', stop);
    document.addEventListener('visibilitychange', hide);
    // Delay by one task so React's development StrictMode can perform its
    // mount/unmount check without opening two permission requests.
    const autoStart = window.setTimeout(() => void camera.start(), 0);
    return () => {
      mounted = false;
      window.clearTimeout(autoStart);
      window.removeEventListener('pagehide', stop);
      document.removeEventListener('visibilitychange', hide);
      camera.stop();
      controller.current = null;
    };
  }, []);
  const running = ['requesting', 'loading', 'tracking', 'missing'].includes(
    status,
  );
  return (
    <aside
      className={`gesture-camera${running ? ' is-running' : ''}${status === 'tracking' && tracking?.upperBody ? ' is-tracking' : ''}`}
      aria-label="Optional camera"
    >
      <h3>
        <span className="gesture-camera__dot" aria-hidden="true" />
        Your camera
      </h3>
      <div className="camera-preview" hidden={!running}>
        <video
          ref={video}
          muted
          playsInline
          aria-label="Local camera preview"
        />
        <canvas
          ref={overlay}
          aria-label="Developer pose skeleton"
          hidden={!developerMode || !showSkeleton || !running}
        />
      </div>
      <p role="status">{messages[status]}</p>
      {running && tracking?.upperBody && !tracking.calibrated && (
        <p>We can see you! Relax your arms for a moment.</p>
      )}
      {running && tracking?.upperBody && tracking.calibrated && (
        <p>
          {tracking.crouchAvailable
            ? 'Full body detected — every move works!'
            : "Upper body detected — that's enough!"}
        </p>
      )}
      {running && tracking?.pending && (
        <p className="gesture-almost" aria-hidden="true">
          {ALMOST[tracking.pending]}
        </p>
      )}
      {recognized && (
        <p role="status">
          <strong>{recognized}</strong>
        </p>
      )}
      <div className="camera-controls">
        <button
          className="btn btn--secondary"
          disabled={running}
          onClick={() => void controller.current?.start()}
        >
          Start Camera
        </button>
        {running && (
          <button
            className="btn btn--ghost"
            onClick={() => controller.current?.stop()}
          >
            Stop Camera
          </button>
        )}
      </div>
      {developerMode && (
        <details className="pose-debug-controls">
          <summary>Developer tracking</summary>
          <label>
            <input
              type="checkbox"
              checked={showSkeleton}
              onChange={(event) => {
                const enabled = event.target.checked;
                setShowSkeleton(enabled);
                controller.current?.setDebug(enabled);
              }}
            />{' '}
            Show skeleton
          </label>
          <dl className="pose-debug-stats">
            <dt>Inference</dt>
            <dd>{running ? `${fps} fps` : 'off'}</dd>
            <dt>Landmarks</dt>
            <dd>{tracking?.landmarkCount ?? 0}</dd>
            <dt>Confidence</dt>
            <dd>{tracking?.confidence?.toFixed(2) ?? '—'}</dd>
            <dt>Body</dt>
            <dd>
              {!tracking?.upperBody
                ? 'not found'
                : tracking.legsVisible
                  ? 'full body'
                  : 'upper body'}
              {tracking?.calibrated ? ', calibrated' : ''}
              {tracking?.crouchAvailable ? ', crouch on' : ''}
            </dd>
            <dt>Head</dt>
            <dd>{tracking?.headDirection ?? '—'}</dd>
            <dt>Forming</dt>
            <dd>
              {tracking?.pending
                ? `${tracking.pending} ${Math.round((tracking.progress ?? 0) * 100)}%`
                : '—'}
            </dd>
            <dt>Last event</dt>
            <dd>{recognized || '—'}</dd>
          </dl>
          <p>
            Joint numbers are shown only in this local preview. No recording or
            saving.
          </p>
        </details>
      )}
      <small>
        Only on this device. No recording or uploads. Sitting is fine!
      </small>
    </aside>
  );
}
