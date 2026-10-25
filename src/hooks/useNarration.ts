import { useEffect, useRef } from 'react';
import { narrator } from '../audio/narrator';

/**
 * Speech is a best-effort enhancement. Captions and story time never wait for it.
 * `lineId` must be stable for a line: the narrator speaks each id once, so
 * re-renders, remounts and gestures never restart it. Change the id (e.g. on
 * restart) or call the returned replay() to speak a line again.
 */
export function useNarration(
  lineId: string,
  text: string,
  enabled: boolean,
  paused: boolean,
  audioUrl?: string,
  audioDurationMs?: number | null,
  slotDurationMs?: number,
  preloadUrl?: string,
  onFinished?: () => void,
) {
  const onFinishedRef = useRef(onFinished);
  useEffect(() => {
    onFinishedRef.current = onFinished;
  }, [onFinished]);
  useEffect(() => {
    narrator.claim();
    return () => narrator.release();
  }, []);
  useEffect(() => narrator.setEnabled(enabled), [enabled]);
  useEffect(() => narrator.setPaused(paused), [paused]);
  useEffect(
    () =>
      narrator.setLine(
        lineId,
        text,
        audioUrl,
        audioDurationMs,
        slotDurationMs,
        () => onFinishedRef.current?.(),
      ),
    [lineId, text, audioUrl, audioDurationMs, slotDurationMs],
  );
  useEffect(() => {
    if (!preloadUrl || typeof document === 'undefined') return;
    const preload = document.createElement('link');
    preload.rel = 'preload';
    preload.as = 'audio';
    preload.href = preloadUrl;
    document.head.append(preload);
    return () => preload.remove();
  }, [preloadUrl]);
  return narrator.replay;
}
