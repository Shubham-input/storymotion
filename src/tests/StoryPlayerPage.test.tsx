import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { StoryPlayerPage } from '../components/player/StoryPlayerPage';
import { SessionProvider } from '../app/SessionContext';
import type { BodyGestureEvent } from '../vision/bodyGestures';
import type { MagicAction } from '../vision/magicGesture';
import type { TrackingStatus } from '../vision/poseCamera';
import { MOMENTS, SCRIPTS } from '../engine/automaticStory';

vi.mock('../audio/generatedNarration', () => ({
  generatedNarrationFor: () => undefined,
}));

vi.mock('../components/gesture/GestureCamera', () => ({
  GestureCamera: ({
    onAction,
    onGesture,
    onStatusChange,
    onPending,
  }: {
    onGesture: (event: BodyGestureEvent) => void;
    onAction: (event: MagicAction) => void;
    onStatusChange: (status: TrackingStatus) => void;
    onPending?: (gesture: BodyGestureEvent['type'] | null) => void;
  }) => (
    <aside>
      <button onClick={() => onPending?.('ARMS_WIDE')}>Synthetic forming</button>
      <button onClick={() => onPending?.(null)}>Synthetic relaxed</button>
      {(['LEAN_LEFT', 'LEAN_RIGHT', 'ARMS_WIDE', 'CROUCH'] as const).map(
        (type) => (
          <button
            key={type}
            onClick={() => onGesture({ type })}
          >{`Synthetic ${type}`}</button>
        ),
      )}
      <button onClick={() => onAction({ type: 'MAGIC_ACTIVATE' })}>
        Synthetic hand raise
      </button>
      <button onClick={() => onStatusChange('requesting')}>Start Camera</button>
      <button onClick={() => onStatusChange('missing')}>Camera loaded</button>
      <button onClick={() => onStatusChange('denied')}>Camera denied</button>
    </aside>
  ),
}));
function renderPlayer(storyId = 'hare', cameraReady = true) {
  const router = createMemoryRouter(
    [
      { path: '/library/:storyId/play', element: <StoryPlayerPage /> },
      { path: '/library/:storyId/complete', element: <h1>Story complete</h1> },
    ],
    { initialEntries: [`/library/${storyId}/play`] },
  );
  const view = render(
    <SessionProvider>
      <RouterProvider router={router} />
    </SessionProvider>,
  );
  if (cameraReady) fireEvent.click(screen.getByText('Camera loaded'));
  return view;
}
// Flush React effects between wall-clock chunks so narration completion can unlock
// a pending invitation before the following chunk spends its response window.
const advance = (ms: number) => {
  for (let elapsed = 0; elapsed < ms; elapsed += 1000)
    act(() => vi.advanceTimersByTime(Math.min(1000, ms - elapsed)));
};
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

// Wall-clock milestones (story time holds while an invitation is open).
const [SHIELD, PATH, BOOST] = MOMENTS;
const SHIELD_AT = SHIELD.startMs;
const PATH_AFTER_SHIELD = PATH.startMs - SHIELD.startMs + 100; // plus one tick
const BOOST_AFTER_PATH = BOOST.startMs - PATH.startMs + 100;
const NO_INPUT_MS =
  SCRIPTS.hare.durationMs + MOMENTS.reduce((sum, m) => sum + m.windowMs, 0) + 1000;
const tortoise = (container: HTMLElement) =>
  container.querySelector<HTMLElement>('[data-testid="tortoise-actor"]')!;
const caption = (text: RegExp) => screen.getByText(text, { selector: 'p' });

describe('integrated automatic story', () => {
  it.each(['hare', 'beanstalk', 'pigs'])(
    'renders %s animation without missing assets and finishes with no input',
    (story) => {
      const { container } = renderPlayer(story);
      expect(screen.getByRole('img')).toBeInTheDocument();
      expect(container.querySelector('svg[role="img"], [role="img"] svg')).not.toBeNull();
      expect(container.querySelector('img[src], video[src]')).toBeNull();
      expect(screen.queryByText('🎬')).not.toBeInTheDocument();
      const script = SCRIPTS[story as keyof typeof SCRIPTS];
      advance(
        script.durationMs +
          script.moments.reduce((sum, moment) => sum + moment.windowMs, 0) +
          1000,
      );
      expect(screen.getByText('Story complete')).toBeInTheDocument();
    },
  );
  it('stops at the obstacle and holds the story while asking for help', () => {
    const { container } = renderPlayer();
    advance(SHIELD_AT);
    expect(screen.getByText('Tortoise needs your help!')).toBeInTheDocument();
    expect(tortoise(container).dataset.state).toBe('worried');
    expect(container.querySelector('.forest-dim')).toHaveClass('is-dark');
    const narration = screen.getByText(/Hare zoomed ahead/);
    advance(6000);
    expect(screen.getByText('Tortoise needs your help!')).toBeInTheDocument();
    expect(screen.getByText(/Hare zoomed ahead/)).toBe(narration);
  });
  it.each([
    ['gesture', 'Synthetic ARMS_WIDE'],
    ['button', 'Use Magic'],
  ])('ARMS_WIDE by %s raises the shield on Tortoise and closes the invitation', (_, control) => {
    const { container } = renderPlayer();
    advance(SHIELD_AT);
    fireEvent.click(screen.getByRole('button', { name: control }));
    expect(caption(/Magic shield!/)).toBeInTheDocument();
    expect(screen.getByText('✨ You did it!')).toBeInTheDocument();
    expect(tortoise(container).querySelector('.actor-shield')).not.toBeNull();
    expect(tortoise(container).dataset.state).toBe('magic');
    expect(container.querySelector('.forest-glow')).not.toBeNull();
    expect(container.querySelector('.forest-dim')).not.toHaveClass('is-dark');
    expect(screen.queryByRole('button', { name: 'Use Magic' })).not.toBeInTheDocument();
    // Holding the pose: the camera sending it again changes nothing.
    fireEvent.click(screen.getByRole('button', { name: 'Synthetic ARMS_WIDE' }));
    expect(screen.getAllByText(/Magic shield!/, { selector: 'p' })).toHaveLength(1);
    advance(2000);
    expect(tortoise(container).dataset.state).toBe('walk');
    advance(NO_INPUT_MS);
    expect(screen.getByText('Story complete')).toBeInTheDocument();
  });
  it('ignores gestures that the current moment does not ask for', () => {
    renderPlayer();
    advance(SHIELD_AT);
    fireEvent.click(screen.getByRole('button', { name: 'Synthetic LEAN_LEFT' }));
    fireEvent.click(screen.getByRole('button', { name: 'Synthetic hand raise' }));
    expect(screen.getByText('Tortoise needs your help!')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Choose Left' })).not.toBeInTheDocument();
  });
  it.each([
    ['LEAN_LEFT', 'Choose Left', 'shady', /Left path chosen!/],
    ['LEAN_RIGHT', 'Choose Right', 'sunny', /Right path chosen!/],
  ] as const)(
    '%s (gesture or button) picks the %s path',
    (type, button, side, text) => {
      for (const control of [`Synthetic ${type}`, button]) {
        const { container, unmount } = renderPlayer();
        advance(SHIELD_AT);
        fireEvent.click(screen.getByRole('button', { name: 'Use Magic' }));
        advance(PATH_AFTER_SHIELD);
        expect(screen.getByText('Which way should Tortoise go?')).toBeInTheDocument();
        expect(tortoise(container).dataset.state).toBe('ponder');
        expect(container.querySelector('.forest-fork')).toHaveClass('is-asking');
        fireEvent.click(screen.getByRole('button', { name: control }));
        expect(caption(text)).toBeInTheDocument();
        expect(container.querySelector('.forest-fork')).toHaveClass(`chose-${side}`);
        expect(tortoise(container).querySelector('.actor-lane')).toHaveClass(`lane-${side}`);
        expect(tortoise(container)).toHaveClass(
          side === 'shady' ? 'fx-look-up' : 'fx-look-down',
        );
        expect(screen.queryByRole('button', { name: button })).not.toBeInTheDocument();
        unmount();
      }
    },
  );
  it.each(['Synthetic hand raise', 'Give Boost'])(
    '%s gives Tortoise the final boost, then the story finishes',
    (control) => {
      const { container } = renderPlayer();
      advance(SHIELD_AT);
      fireEvent.click(screen.getByRole('button', { name: 'Use Magic' }));
      advance(PATH_AFTER_SHIELD);
      fireEvent.click(screen.getByRole('button', { name: 'Choose Right' }));
      advance(BOOST_AFTER_PATH);
      expect(screen.getByText('Give Tortoise one last boost!')).toBeInTheDocument();
      expect(tortoise(container).dataset.state).toBe('tired');
      fireEvent.click(screen.getByRole('button', { name: control }));
      expect(caption(/A sparkly boost!/)).toBeInTheDocument();
      expect(container.querySelector('.animated-story')).toHaveClass('has-magic');
      expect(tortoise(container).dataset.state).toBe('magic');
      advance(2000);
      expect(tortoise(container).dataset.state).toBe('energized');
      advance(4000);
      expect(screen.queryByText(/A sparkly boost!/)).not.toBeInTheDocument();
      advance(4000); // the last scene: the ending card and its moral
      expect(container.querySelector('.forest-endcard')).toHaveTextContent(
        'The End — Adventure Complete!',
      );
      advance(20000);
      expect(screen.getByText('Story complete')).toBeInTheDocument();
    },
  );
  it('resolves every moment kindly when nobody answers', () => {
    const { container } = renderPlayer();
    advance(SHIELD_AT + 8200);
    expect(caption(/Tortoise found another way/)).toBeInTheDocument();
    expect(screen.getByText('No problem!')).toBeInTheDocument();
    expect(tortoise(container).dataset.state).toBe('tuck');
    expect(tortoise(container).querySelector('.actor-shield')).toBeNull();
    advance(PATH_AFTER_SHIELD + 7200);
    expect(caption(/picked the sunny meadow/)).toBeInTheDocument();
    expect(container.querySelector('.forest-fork')).toHaveClass('chose-sunny');
    advance(BOOST_AFTER_PATH + 7200);
    expect(caption(/steady and strong/)).toBeInTheDocument();
    advance(NO_INPUT_MS);
    expect(screen.getByText('Story complete')).toBeInTheDocument();
    expect(screen.queryByText(/fail|wrong/i)).not.toBeInTheDocument();
  });
  it('does not spend the response window during camera setup, including setup midway through a prompt', () => {
    renderPlayer();
    advance(SHIELD_AT - 1000);
    fireEvent.click(screen.getByRole('button', { name: 'Start Camera' }));
    advance(3000);
    expect(screen.queryByRole('button', { name: 'Use Magic' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Camera loaded'));
    advance(1200);
    expect(screen.getByRole('button', { name: 'Use Magic' })).toBeInTheDocument();
    advance(4000);
    fireEvent.click(screen.getByRole('button', { name: 'Start Camera' }));
    advance(200);
    expect(screen.queryByRole('button', { name: 'Use Magic' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Camera loaded'));
    advance(200);
    advance(7400); // a fresh full window after the second setup
    expect(screen.getByRole('button', { name: 'Use Magic' })).toBeInTheDocument();
  });
  it('holds the opening scene until the automatic camera preflight resolves', () => {
    renderPlayer('hare', false);
    advance(12000);
    expect(
      screen.getByText(/Once upon a time, in a sunny forest/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Nobody can beat me/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Camera loaded'));
    advance(9200);
    expect(screen.getByText(/Nobody can beat me/)).toBeInTheDocument();
  });
  it('keeps the story frozen even when camera setup takes a long time', () => {
    renderPlayer();
    advance(SHIELD_AT - 1000);
    fireEvent.click(screen.getByRole('button', { name: 'Start Camera' }));
    advance(9400);
    expect(screen.queryByRole('button', { name: 'Use Magic' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Tortoise found another way/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Camera loaded'));
    advance(1200);
    expect(screen.getByRole('button', { name: 'Use Magic' })).toBeInTheDocument();
  });
  it('keeps manual interaction available after denied permission', () => {
    renderPlayer();
    fireEvent.click(screen.getByRole('button', { name: 'Start Camera' }));
    advance(SHIELD_AT);
    fireEvent.click(screen.getByText('Camera denied'));
    advance(SHIELD_AT + 200);
    fireEvent.click(screen.getByRole('button', { name: 'Use Magic' }));
    expect(caption(/Magic shield!/)).toBeInTheDocument();
  });
  it('freezes time and rejects gestures while paused; replay resets the story', () => {
    renderPlayer();
    advance(SHIELD_AT);
    const pause = screen.getByRole('button', { name: 'Pause story' });
    pause.focus();
    fireEvent.click(pause);
    advance(40000);
    fireEvent.click(screen.getByText('Synthetic ARMS_WIDE'));
    expect(screen.queryByText(/Magic shield!/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
    expect(pause).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Use Magic' }));
    expect(caption(/Magic shield!/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Restart story' }));
    expect(screen.queryByText(/Magic shield!/)).not.toBeInTheDocument();
    expect(screen.getByText(/Once upon a time, in a sunny forest/)).toBeInTheDocument();
  });
  it('shows "Almost there…" only while a gesture is forming during an invitation', () => {
    renderPlayer();
    fireEvent.click(screen.getByText('Synthetic forming'));
    expect(screen.queryByText('Almost there…')).not.toBeInTheDocument();
    advance(SHIELD_AT);
    expect(screen.getByText('Tortoise needs your help!')).toBeInTheDocument();
    expect(screen.getByText('Almost there…')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Synthetic relaxed'));
    expect(screen.queryByText('Almost there…')).not.toBeInTheDocument();
  });
});
