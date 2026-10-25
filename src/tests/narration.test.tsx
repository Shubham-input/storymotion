import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { createNarrator } from '../audio/narrator';
import { narrator } from '../audio/narrator';
import { StoryPlayerPage } from '../components/player/StoryPlayerPage';
import { SessionProvider } from '../app/SessionContext';
import { animatedBeats } from '../data/stories/animatedBeats';
import { MOMENTS } from '../engine/automaticStory';
import { STORY_SCENES } from '../data/stories/scenes';
import type { BodyGestureEvent } from '../vision/bodyGestures';

vi.mock('../audio/generatedNarration', () => ({
  generatedNarrationFor: () => undefined,
}));

/** Story second at which the first invitation (the shield) opens. */
const SHIELD_S = MOMENTS[0].startMs / 1000;

class FakeUtterance {
  rate = 1;
  lang = '';
  onboundary: ((event: { charIndex: number }) => void) | null = null;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  text: string;
  constructor(text: string) {
    this.text = text;
  }
}
function fakeSynth() {
  const spoken: FakeUtterance[] = [];
  return {
    spoken,
    texts: () => spoken.map((utterance) => utterance.text),
    speak: vi.fn((utterance: FakeUtterance) => void spoken.push(utterance)),
    cancel: vi.fn(),
  };
}
const last = (synth: ReturnType<typeof fakeSynth>) =>
  synth.spoken[synth.spoken.length - 1];

describe('narrator controller', () => {
  let synth: ReturnType<typeof fakeSynth>;
  let n: ReturnType<typeof createNarrator>;
  beforeEach(() => {
    synth = fakeSynth();
    n = createNarrator(
      () => synth as unknown as SpeechSynthesis,
      (text) => new FakeUtterance(text) as unknown as SpeechSynthesisUtterance,
    );
  });

  it('speaks a line id once, however often it is requested', () => {
    n.setLine('hare:0:0', 'On a sunny morning.');
    n.setLine('hare:0:0', 'On a sunny morning.');
    last(synth).onend?.();
    n.setLine('hare:0:0', 'On a sunny morning.');
    expect(synth.texts()).toEqual(['On a sunny morning.']);
  });
  it('moves on to the next line and ignores the old line finishing late', () => {
    n.setLine('a', 'First line.');
    const first = last(synth);
    n.setLine('b', 'Second line.');
    first.onend?.(); // Chrome delivers the cancelled utterance's end afterwards
    expect(n.state.status).toBe('speaking');
    expect(synth.texts()).toEqual(['First line.', 'Second line.']);
  });
  it('resumes from the interrupted word instead of restarting the line', () => {
    n.setLine('a', 'Hare raced ahead quickly.');
    last(synth).onboundary?.({ charIndex: 11 });
    n.setPaused(true);
    expect(synth.cancel).toHaveBeenCalled();
    n.setPaused(false);
    expect(synth.texts()).toEqual(['Hare raced ahead quickly.', 'ahead quickly.']);
  });
  it('does not respeak a finished line on resume or unmute', () => {
    n.setLine('a', 'Done.');
    last(synth).onend?.();
    n.setPaused(true);
    n.setPaused(false);
    n.setEnabled(false);
    n.setEnabled(true);
    expect(synth.texts()).toEqual(['Done.']);
  });
  it('holds a line that starts while muted and never overlaps voices', () => {
    n.setEnabled(false);
    n.setLine('a', 'Quiet line.');
    expect(synth.speak).not.toHaveBeenCalled();
    n.setEnabled(true);
    expect(synth.texts()).toEqual(['Quiet line.']);
    // Every speak is preceded by a cancel, so two voices never play at once.
    expect(synth.cancel.mock.calls.length).toBeGreaterThanOrEqual(
      synth.speak.mock.calls.length,
    );
  });
  it('estimates the resume word when the voice reports no boundaries', () => {
    vi.useFakeTimers();
    n.setLine('a', 'On a sunny morning, Hare challenged Tortoise.');
    vi.advanceTimersByTime(1000); // ~12 characters: inside "morning,"
    n.setPaused(true);
    n.setPaused(false);
    expect(last(synth).text).toBe('morning, Hare challenged Tortoise.');
    vi.advanceTimersByTime(60000); // long enough to have finished
    n.setPaused(true);
    n.setPaused(false);
    expect(synth.spoken).toHaveLength(2);
    vi.useRealTimers();
  });
  it('replays from the start only when asked', () => {
    n.setLine('a', 'Steady wins.');
    last(synth).onboundary?.({ charIndex: 7 });
    n.replay();
    expect(synth.texts()).toEqual(['Steady wins.', 'Steady wins.']);
  });
  it('uses generated audio, pauses and resumes it, then falls back to speech on error', async () => {
    const tracks: Array<{
      playbackRate: number;
      play: ReturnType<typeof vi.fn>;
      pause: ReturnType<typeof vi.fn>;
      onended: (() => void) | null;
      onerror: (() => void) | null;
    }> = [];
    const withAudio = createNarrator(
      () => synth as unknown as SpeechSynthesis,
      (text) => new FakeUtterance(text) as unknown as SpeechSynthesisUtterance,
      () => {
        const track = {
          playbackRate: 1,
          play: vi.fn().mockResolvedValue(undefined),
          pause: vi.fn(),
          onended: null,
          onerror: null,
        };
        tracks.push(track);
        return track as unknown as HTMLAudioElement;
      },
    );

    withAudio.setLine('a', 'Canonical caption.', '/audio/a.wav', 9000, 8000);
    expect(tracks).toHaveLength(1);
    expect(tracks[0].play).toHaveBeenCalledOnce();
    expect(tracks[0].playbackRate).toBeGreaterThan(1);
    expect(synth.speak).not.toHaveBeenCalled();

    withAudio.setPaused(true);
    expect(tracks[0].pause).toHaveBeenCalledOnce();
    withAudio.setPaused(false);
    expect(tracks[0].play).toHaveBeenCalledTimes(2);

    tracks[0].onerror?.();
    expect(synth.texts()).toEqual(['Canonical caption.']);
  });
  it('starts queued generated audio after camera setup instead of browser speech', () => {
    const tracks: Array<{
      playbackRate: number;
      play: ReturnType<typeof vi.fn>;
      pause: ReturnType<typeof vi.fn>;
      onended: (() => void) | null;
      onerror: (() => void) | null;
    }> = [];
    const withAudio = createNarrator(
      () => synth as unknown as SpeechSynthesis,
      (text) => new FakeUtterance(text) as unknown as SpeechSynthesisUtterance,
      () => {
        const track = {
          playbackRate: 1,
          play: vi.fn().mockResolvedValue(undefined),
          pause: vi.fn(),
          onended: null,
          onerror: null,
        };
        tracks.push(track);
        return track as unknown as HTMLAudioElement;
      },
    );

    // StoryPlayer queues its opening line while the camera permission UI is open.
    withAudio.setPaused(true);
    withAudio.setLine('a', 'Canonical caption.', '/audio/a.wav');
    expect(tracks).toHaveLength(0);
    expect(synth.speak).not.toHaveBeenCalled();

    // Finishing camera setup must start the recording, not speechSynthesis.
    withAudio.setPaused(false);
    expect(tracks).toHaveLength(1);
    expect(tracks[0].play).toHaveBeenCalledOnce();
    expect(synth.speak).not.toHaveBeenCalled();
  });
  it('reports completion only when the current narration actually ends', () => {
    const finished = vi.fn();
    n.setLine('a', 'Wait for me.', undefined, undefined, undefined, finished);
    expect(finished).not.toHaveBeenCalled();
    last(synth).onend?.();
    expect(finished).toHaveBeenCalledOnce();
    last(synth).onend?.();
    expect(finished).toHaveBeenCalledOnce();
  });
  it('interjects a reaction once, ending the current line for good', () => {
    n.setLine('beat', 'A long story line.');
    n.interject('react:shield', 'Wow!');
    n.interject('react:shield', 'Wow!');
    n.setPaused(true);
    n.setPaused(false);
    n.setEnabled(false);
    n.setEnabled(true);
    expect(synth.texts()).toEqual(['A long story line.', 'Wow!']);
    n.setLine('next', 'Next line.');
    expect(synth.texts().at(-1)).toBe('Next line.');
  });
  it('silences a reaction on pause and does not resume it', () => {
    n.setLine('beat', 'Line.');
    last(synth).onend?.();
    n.interject('react', 'Hooray!');
    const cancels = synth.cancel.mock.calls.length;
    n.setPaused(true);
    expect(synth.cancel.mock.calls.length).toBe(cancels + 1);
    n.setPaused(false);
    expect(synth.texts()).toEqual(['Line.', 'Hooray!']);
  });
  it('survives an immediate remount but stops after a real unmount', () => {
    vi.useFakeTimers();
    n.setLine('a', 'Line.');
    n.release();
    n.claim(); // StrictMode remount
    vi.runAllTimers();
    expect(n.state.lineId).toBe('a');
    n.release();
    vi.runAllTimers();
    expect(n.state.lineId).toBeNull();
    vi.useRealTimers();
  });
});

vi.mock('../components/gesture/GestureCamera', () => ({
  GestureCamera: ({
    onGesture,
    onStatusChange,
  }: {
    onGesture: (event: BodyGestureEvent) => void;
    onStatusChange?: (status: 'missing') => void;
  }) => (
    <>
      <button onClick={() => onStatusChange?.('missing')}>Camera loaded</button>
      <button onClick={() => onGesture({ type: 'ARMS_WIDE' })}>
        Synthetic ARMS_WIDE
      </button>
      <button onClick={() => onGesture({ type: 'LEAN_RIGHT' })}>
        Synthetic LEAN_RIGHT
      </button>
    </>
  ),
}));

describe('story player narration', () => {
  let synth: ReturnType<typeof fakeSynth>;
  const beats = animatedBeats.hare;
  const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms));
  const finishCurrentLine = () => act(() => last(synth)?.onend?.());
  const timesSpoken = (text: string) =>
    synth.texts().filter((spoken) => spoken === text).length;

  beforeEach(() => {
    vi.useFakeTimers();
    narrator.stop();
    synth = fakeSynth();
    vi.stubGlobal('speechSynthesis', synth);
    vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
  });
  afterEach(() => {
    cleanup();
    vi.runOnlyPendingTimers();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });
  function renderPlayer(storyId = 'hare') {
    const router = createMemoryRouter(
      [
        { path: '/library/:storyId/play', element: <StoryPlayerPage /> },
        { path: '/library/:storyId/complete', element: <h1>Story complete</h1> },
      ],
      { initialEntries: [`/library/${storyId}/play`] },
    );
    const tree = () => (
      <StrictMode>
        <SessionProvider>
          <RouterProvider router={router} />
        </SessionProvider>
      </StrictMode>
    );
    const view = render(tree());
    fireEvent.click(screen.getByText('Camera loaded'));
    return { ...view, rerender: () => view.rerender(tree()) };
  }

  it('speaks the opening line once under StrictMode and across re-renders', () => {
    const { rerender } = renderPlayer();
    advance(1000); // ~5 story ticks, each a re-render
    rerender();
    rerender();
    expect(synth.texts()).toEqual([beats[0]]);
  });
  it('reveals a challenge only after its narration ends, with a fresh timer', () => {
    const { container } = renderPlayer();
    advance(SHIELD_S * 1000);
    expect(screen.queryByText('Tortoise needs your help!')).not.toBeInTheDocument();

    advance(5000);
    expect(screen.queryByText('Tortoise needs your help!')).not.toBeInTheDocument();
    act(() => last(synth).onend?.());

    expect(screen.getByText('Tortoise needs your help!')).toBeInTheDocument();
    const timer = container.querySelector<HTMLElement>('.invite-timer span');
    expect(timer).toHaveStyle({ width: '100%' });
    advance(1000);
    expect(Number.parseFloat(timer?.style.width ?? '100')).toBeLessThan(100);
  });
  it('narrates each beat exactly once, in order, during normal playback', () => {
    renderPlayer();
    // No input: three held invitations resolve themselves along the way.
    for (let second = 0; second < 80; second++) {
      advance(1000);
      finishCurrentLine();
    }
    const spoken = synth.texts();
    expect(spoken.filter((text) => beats.includes(text))).toEqual([...beats]);
    // Challenge outcomes use effects and captions, never extra synthesized speech.
    expect(spoken).toHaveLength(beats.length);
    expect(screen.getByText('Story complete')).toBeInTheDocument();
    vi.runOnlyPendingTimers();
    expect(synth.cancel).toHaveBeenCalled(); // leaving the player silences it
  }, 20000); // renders a whole 80 s playthrough; slow machines need headroom
  it.each(['beanstalk', 'pigs'] as const)(
    'narrates every %s scene exactly once, in story order, with no input',
    (storyId) => {
      renderPlayer(storyId);
      for (let second = 0; second < 240; second++) {
        advance(1000);
        finishCurrentLine();
      }
      const lines = STORY_SCENES[storyId].map((scene) => scene.narration);
      const spoken = synth.texts().filter((text) => lines.includes(text));
      expect(spoken).toEqual(lines);
      expect(screen.getByText('Story complete')).toBeInTheDocument();
    },
    30000,
  );
  it('does not restart the line on pause/resume, mute/unmute or gestures', () => {
    renderPlayer();
    advance(2000);
    fireEvent.click(screen.getByRole('button', { name: 'Pause story' }));
    advance(3000); // paused: no ticks, no speech
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
    // No boundary events from the fake voice: resumes near "(a) sunny forest…".
    expect(synth.texts().at(-1)).toMatch(/^(a )?sunny forest, lived a speedy Hare/);
    fireEvent.click(screen.getByRole('button', { name: 'Mute narration' }));
    fireEvent.click(screen.getByRole('button', { name: 'Unmute narration' }));
    for (let second = 0; second < SHIELD_S - 2; second++) {
      advance(1000);
      finishCurrentLine();
    }
    expect(screen.getByText('Tortoise needs your help!')).toBeInTheDocument();
    // A gesture that the moment does not ask for says nothing.
    fireEvent.click(screen.getByText('Synthetic LEAN_RIGHT'));
    const before = synth.texts().length;
    fireEvent.click(screen.getByText('Synthetic ARMS_WIDE'));
    // The right gesture uses its visual/audio effect without browser speech.
    expect(synth.texts().slice(before)).toEqual([]);
    fireEvent.click(screen.getByText('Synthetic ARMS_WIDE'));
    for (let second = 0; second < 3; second++) advance(1000);
    expect(synth.texts()).toHaveLength(before);
    expect(timesSpoken(beats[0])).toBe(1);
    expect(timesSpoken(beats[1])).toBe(1);
  });
  it('never speaks challenge-result captions', () => {
    renderPlayer();
    for (let second = 0; second < SHIELD_S; second++) {
      advance(1000);
      finishCurrentLine();
    }
    expect(screen.getByText('Tortoise needs your help!')).toBeInTheDocument();
    const before = synth.texts().length;
    fireEvent.click(screen.getByText('Synthetic ARMS_WIDE'));
    advance(1000);
    expect(synth.texts()).toHaveLength(before);
    expect(synth.texts().some((text) => text.includes('magic shield'))).toBe(false);
  });
  it('speaks again only on intentional replay or restart', () => {
    renderPlayer();
    advance(1000);
    fireEvent.click(screen.getByRole('button', { name: 'Replay narration' }));
    expect(timesSpoken(beats[0])).toBe(2);
    for (let second = 0; second < 9; second++) advance(1000);
    expect(synth.texts().at(-1)).toBe(beats[1]);
    fireEvent.click(screen.getByRole('button', { name: 'Restart story' }));
    expect(synth.texts().at(-1)).toBe(beats[0]);
    expect(timesSpoken(beats[0])).toBe(3);
  });
});
