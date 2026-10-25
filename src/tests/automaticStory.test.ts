import { describe, expect, it } from 'vitest';
import {
  automaticStoryReducer as reduce,
  initialAutomaticStory,
  MOMENTS,
  STORY_DURATION_MS,
} from '../engine/automaticStory';
import type {
  AutomaticStoryState,
  StoryAction,
} from '../engine/automaticStory';

const [SHIELD, PATH, BOOST] = MOMENTS;
const run = (state: AutomaticStoryState, ...actions: StoryAction[]) =>
  actions.reduce(reduce, state);
const tick = (ms: number): StoryAction => ({ type: 'TICK', ms });
const readyStory = () =>
  [...new Set(MOMENTS.map((moment) => moment.sceneId))].reduce(
    (state, sceneId) => reduce(state, { type: 'NARRATION_FINISHED', sceneId }),
    initialAutomaticStory(),
  );
/** Advance wall time in small steps, like the real 200 ms interval. */
const advance = (state: AutomaticStoryState, ms: number) => {
  let next = state;
  for (let t = 0; t < ms; t += 200) next = reduce(next, tick(200));
  return next;
};
/** Advance until story time reaches `elapsed` (or an invitation opens on the way). */
const until = (state: AutomaticStoryState, elapsed: number) => {
  let next = state;
  while (next.elapsed < elapsed && next.interaction === 'waiting' && !next.finished)
    next = reduce(next, tick(200));
  return next;
};

describe('automatic story timeline', () => {
  it('stops at each obstacle exactly on time and holds story time while it waits', () => {
    let state = until(readyStory(), SHIELD.startMs);
    expect(state.interaction).toBe('open');
    expect(state.elapsed).toBe(SHIELD.startMs);
    state = advance(state, SHIELD.windowMs - 200);
    expect(state.elapsed).toBe(SHIELD.startMs);
    expect(state.interaction).toBe('open');
    expect(state.remaining).toBe(200);
  });

  it('resolves every moment automatically and finishes with no input at all', () => {
    let state = readyStory();
    for (const [index, moment] of MOMENTS.entries()) {
      state = until(state, moment.startMs);
      expect(state.moment).toBe(index);
      expect(state.interaction).toBe('open');
      state = advance(state, moment.windowMs);
      expect(state.moment).toBe(index + 1);
      expect(state.auto[index]).toBe(true);
    }
    state = advance(state, STORY_DURATION_MS);
    expect(state.finished).toBe(true);
    expect(state.responses).toEqual([null, null, null]);
    expect(state.auto).toEqual([true, true, true]);
    expect(state.magic).toBe(false);
  });

  it('accepts only the gestures each moment asks for', () => {
    let state = until(readyStory(), SHIELD.startMs);
    for (const type of ['LEAN_LEFT', 'HAND_RAISE', 'CROUCH'] as const)
      expect(reduce(state, { type })).toBe(state);
    expect(reduce(state, { type: 'MAGIC_ACTIVATE' })).toBe(state);
    state = reduce(state, { type: 'ARMS_WIDE' });
    state = until(state, PATH.startMs);
    expect(reduce(state, { type: 'ARMS_WIDE' })).toBe(state);
    state = reduce(state, { type: 'LEAN_LEFT' });
    state = until(state, BOOST.startMs);
    expect(reduce(state, { type: 'LEAN_RIGHT' })).toBe(state);
    state = reduce(state, { type: 'MAGIC_ACTIVATE' });
    expect(state.responses).toEqual(['ARMS_WIDE', 'LEAN_LEFT', 'HAND_RAISE']);
    expect(state.auto).toEqual([false, false, false]);
    expect(state.magic).toBe(true);
  });

  it('closes the window on the first valid gesture and resumes story time at once', () => {
    let state = until(readyStory(), SHIELD.startMs);
    state = reduce(state, { type: 'ARMS_WIDE' });
    expect(state.interaction).toBe('waiting');
    expect(state.moment).toBe(1);
    // A held pose re-sent by the camera does nothing more.
    expect(reduce(state, { type: 'ARMS_WIDE' })).toBe(state);
    state = reduce(state, tick(200));
    expect(state.elapsed).toBe(SHIELD.startMs + 200);
  });

  it('records one response per moment and ignores extra, early, and paused events', () => {
    let state = readyStory();
    expect(reduce(state, { type: 'ARMS_WIDE' })).toBe(state);
    state = until(state, SHIELD.startMs);
    const paused = reduce(state, { type: 'PAUSE', paused: true });
    expect(reduce(paused, tick(5000))).toBe(paused);
    expect(reduce(paused, { type: 'ARMS_WIDE' })).toBe(paused);
    state = reduce(state, { type: 'ARMS_WIDE' });
    expect(state.responses).toEqual(['ARMS_WIDE', null, null]);
    expect(state.gesture).toBe('ARMS_WIDE');
    expect(reduce(state, { type: 'ARMS_WIDE' })).toBe(state);
    const restarted = reduce(state, { type: 'RESTART' });
    expect(restarted.responses).toEqual([null, null, null]);
    expect(restarted.auto).toEqual([false, false, false]);
    expect(restarted.magic).toBe(false);
  });

  it('freezes the entire timeline during camera setup, then starts from the same point', () => {
    let state = run(readyStory(), {
      type: 'CAMERA_BUSY',
      busy: true,
    });
    state = advance(state, SHIELD.startMs + 2000);
    expect(state.elapsed).toBe(0);
    expect(state.interaction).toBe('waiting');
    state = reduce(state, { type: 'CAMERA_BUSY', busy: false });
    state = until(state, SHIELD.startMs);
    expect(state.interaction).toBe('open');
    expect(state.remaining).toBe(SHIELD.windowMs);
  });

  it('resets an open invitation if camera setup starts mid-window', () => {
    let state = until(readyStory(), SHIELD.startMs);
    state = advance(state, 4000);
    expect(state.interaction).toBe('open');
    state = reduce(state, { type: 'CAMERA_BUSY', busy: true });
    expect(state.interaction).toBe('waiting');
    expect(state.remaining).toBe(SHIELD.windowMs);
    expect(reduce(state, { type: 'ARMS_WIDE' })).toBe(state);
  });

  it('never skips a moment when camera setup takes a long time', () => {
    let state = run(readyStory(), {
      type: 'CAMERA_BUSY',
      busy: true,
    });
    state = advance(state, SHIELD.startMs + SHIELD.windowMs + 400);
    expect(state.elapsed).toBe(0);
    expect(state.moment).toBe(0);
    expect(state.auto[0]).toBe(false);
    state = reduce(state, { type: 'CAMERA_BUSY', busy: false });
    state = until(state, SHIELD.startMs);
    expect(state.interaction).toBe('open');
  });

  it('rewinds a late deferred invitation to its story beat and gives a full window', () => {
    let state = run(
      { ...readyStory(), moment: 2, elapsed: BOOST.startMs + 4000 },
      tick(100),
    );
    expect(state.interaction).toBe('open');
    expect(state.elapsed).toBe(BOOST.startMs);
    state = advance(state, BOOST.windowMs - 400);
    expect(state.interaction).toBe('open');
    state = advance(state, 600);
    expect(state.interaction).toBe('done');
    state = advance(state, STORY_DURATION_MS - state.elapsed);
    expect(state.finished).toBe(true);
  });

  it('waits for the scene narration before revealing or spending a challenge', () => {
    let state = until(initialAutomaticStory(), SHIELD.startMs);
    expect(state.elapsed).toBe(SHIELD.startMs);
    expect(state.interaction).toBe('pending');
    expect(state.remaining).toBe(SHIELD.windowMs);

    state = advance(state, 5000);
    expect(state.interaction).toBe('pending');
    expect(state.remaining).toBe(SHIELD.windowMs);

    state = reduce(state, {
      type: 'NARRATION_FINISHED',
      sceneId: SHIELD.sceneId,
    });
    expect(state.interaction).toBe('open');
    state = advance(state, 1000);
    expect(state.remaining).toBe(SHIELD.windowMs - 1000);
  });
});
