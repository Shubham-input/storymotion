import { useEffect, useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import {
  BEANSTALK_LEGACY_SCENES,
  REQUIRED_EVENTS,
  sceneAt,
  sceneStarts,
  STORY_SCENES,
} from '../data/stories/scenes';
import type { CastId } from '../data/stories/scenes';
import { getStoryById } from '../data/stories/registry';
import { SCRIPTS } from '../engine/automaticStory';
import { STORY_IDS } from '../engine/types';
import type { StoryId } from '../engine/types';
import { STORYBOOK_SCENES } from '../rendering/storybook/registry';
import { StorybookScene } from '../rendering/storybook/StorybookScene';
import { StoryPlayerPage } from '../components/player/StoryPlayerPage';
import { SessionProvider } from '../app/SessionContext';

vi.mock('../components/gesture/GestureCamera', () => ({
  GestureCamera: ({
    onStatusChange,
  }: {
    onStatusChange?: (status: 'missing') => void;
  }) => {
    const initialStatusChange = useRef(onStatusChange);
    useEffect(() => initialStatusChange.current?.('missing'), []);
    return <aside>Camera controls</aside>;
  },
}));

const events = (storyId: StoryId) => STORY_SCENES[storyId].flatMap((scene) => scene.events);
const sceneOf = (storyId: StoryId, event: string) =>
  STORY_SCENES[storyId].findIndex((scene) => scene.events.includes(event));
const castOf = (storyId: StoryId, sceneId: string): readonly CastId[] =>
  STORY_SCENES[storyId].find((scene) => scene.id === sceneId)!.cast;
/** Rough speaking pace at the narrator's 0.88 rate (deliberately slow). */
const speechMs = (text: string) => (text.split(/\s+/).length / 2.2) * 1000;

describe('story structure (all stories)', () => {
  it.each(STORY_IDS)('%s shows every required plot event, in order', (storyId) => {
    const all = events(storyId);
    const order = REQUIRED_EVENTS[storyId].map((event) => all.indexOf(event));
    expect(order.filter((index) => index < 0)).toEqual([]);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });
  it.each(STORY_IDS)('%s opens with an introduction and ends with a conclusion and moral', (storyId) => {
    const scenes = STORY_SCENES[storyId];
    expect(scenes[0].events).toContain('intro');
    expect(scenes.at(-1)!.events).toEqual(expect.arrayContaining(['conclusion', 'moral']));
    // Nothing important happens after the ending.
    expect(sceneOf(storyId, 'conclusion')).toBe(scenes.length - 1);
  });
  it.each(STORY_IDS)('%s has unique scene ids and narration long enough to be heard', (storyId) => {
    const scenes = STORY_SCENES[storyId];
    expect(new Set(scenes.map((scene) => scene.id)).size).toBe(scenes.length);
    for (const scene of scenes) {
      expect(scene.narration.trim().length).toBeGreaterThan(20);
      // The next scene (and its line) never cuts this line off mid-sentence.
      expect(speechMs(scene.narration) + 500).toBeLessThanOrEqual(scene.durationMs);
    }
  });
  it.each(['beanstalk', 'pigs'] as const)(
    '%s invitations wait until their scene narration has been spoken',
    (storyId) => {
      for (const scene of STORY_SCENES[storyId])
        for (const moment of scene.moments ?? [])
          expect(moment.atMs).toBeGreaterThanOrEqual((scene.narration.split(/\s+/).length / 2.4) * 1000);
    },
  );
  it('engine scripts come from the same scene list', () => {
    for (const storyId of STORY_IDS) {
      const scenes = STORY_SCENES[storyId];
      expect(SCRIPTS[storyId].durationMs).toBe(scenes.reduce((sum, s) => sum + s.durationMs, 0));
      for (const moment of SCRIPTS[storyId].moments) {
        const { scene } = sceneAt(storyId, moment.startMs);
        expect(scene.moments?.map((m) => m.id)).toContain(moment.id);
      }
    }
  });
  it('every Jack and Pigs scene has a renderer, and no renderer is orphaned', () => {
    const legacy: readonly string[] = BEANSTALK_LEGACY_SCENES;
    const ids = [...STORY_SCENES.beanstalk, ...STORY_SCENES.pigs]
      .map((scene) => scene.id)
      .filter((id) => !legacy.includes(id));
    expect(Object.keys(STORYBOOK_SCENES).sort()).toEqual([...ids].sort());
  });
});

describe('Jack and the Beanstalk', () => {
  const at = (event: string) => sceneOf('beanstalk', event);
  it('introduces Jack, his mother and the cow before anything else', () => {
    expect(STORY_SCENES.beanstalk[0].cast).toEqual(expect.arrayContaining(['jack', 'mother', 'cow']));
    expect(at('family-needs-food')).toBe(0);
  });
  it('trades the cow for beans on screen: no beans before the trade', () => {
    expect(at('mother-gives-cow')).toBeLessThan(at('trader-offers-beans'));
    expect(at('trader-offers-beans')).toBe(at('cow-traded'));
    expect(at('cow-traded')).toBe(at('jack-receives-beans'));
    const order = events('beanstalk');
    expect(order.indexOf('cow-traded')).toBeLessThan(order.indexOf('jack-receives-beans'));
    expect(castOf('beanstalk', 'jack-trade')).toEqual(expect.arrayContaining(['jack', 'cow', 'trader']));
  });
  it('explains how the beans reach the ground before the beanstalk grows', () => {
    expect(at('mother-upset')).toBeLessThan(at('beanstalk-grows'));
    expect(at('beans-in-ground')).toBeLessThan(at('sprout-appears'));
  });
  it('shows the Giant and the golden hen, and Jack actually takes the hen', () => {
    expect(castOf('beanstalk', 'jack-hen')).toEqual(expect.arrayContaining(['giant', 'hen']));
    expect(at('hen-introduced')).toBeLessThan(at('jack-takes-hen'));
    expect(at('jack-takes-hen')).toBeLessThan(at('giant-notices-missing-hen'));
    expect(at('chase-begins')).toBeLessThan(at('jack-escapes'));
    expect(castOf('beanstalk', 'jack-escape')).toEqual(expect.arrayContaining(['jack', 'giant', 'hen']));
  });
  it('resolves the pursuit before the ending', () => {
    expect(at('beanstalk-cut')).toBeLessThan(at('resolution'));
    expect(at('pursuit-ends')).toBeLessThan(at('conclusion'));
    expect(STORY_SCENES.beanstalk.at(-1)!.cast).toEqual(expect.arrayContaining(['jack', 'mother', 'hen']));
  });
});

describe('The Three Little Pigs', () => {
  const at = (event: string) => sceneOf('pigs', event);
  it('is one continuous story, not three separate character adventures', () => {
    expect(getStoryById('pigs')!.characters).toHaveLength(1);
    expect(STORY_SCENES.pigs[0].cast).toEqual(expect.arrayContaining(['pig-one', 'pig-two', 'pig-three']));
    expect(STORY_SCENES.pigs.at(-1)!.cast).toEqual(expect.arrayContaining(['pig-one', 'pig-two', 'pig-three']));
  });
  it('builds wheat, then stone, then brick', () => {
    expect(at('wheat-house-built')).toBeLessThan(at('stone-house-built'));
    expect(at('stone-house-built')).toBeLessThan(at('brick-house-built'));
  });
  it('puts the Wolf on screen for every encounter', () => {
    for (const id of ['pigs-wolf', 'pigs-wheat-blow', 'pigs-stone-attack', 'pigs-brick-attack', 'pigs-chimney', 'pigs-retreat'])
      expect(castOf('pigs', id)).toContain('wolf');
    expect(at('wolf-introduced')).toBeLessThan(at('wolf-blows-wheat-house'));
  });
  it('reunites all three pigs before the climax, and the wolf leaves before the celebration', () => {
    expect(at('pigs-reunite')).toBeLessThan(at('wolf-attacks-brick-house'));
    expect(castOf('pigs', 'pigs-brick-attack')).toEqual(expect.arrayContaining(['pig-one', 'pig-two', 'pig-three', 'wolf']));
    expect(at('brick-house-stands')).toBeLessThan(at('wolf-retreats'));
    expect(at('wolf-retreats')).toBeLessThan(at('pigs-celebrate'));
  });
});

describe('storybook renderer shows what the narration says', () => {
  const show = (storyId: StoryId, sceneId: string, local: number, outcomes: ('auto' | null)[] = []) => {
    const index = STORY_SCENES[storyId].findIndex((scene) => scene.id === sceneId);
    const start = sceneStarts(storyId)[index];
    return render(<StorybookScene storyId={storyId} elapsed={start + local} paused={false} outcomes={outcomes} />);
  };
  afterEach(cleanup);
  const visible = (id: string) => expect(screen.getAllByTestId(id).length).toBeGreaterThan(0);

  it('Jack, Mother and Milky-White appear at home', () => {
    show('beanstalk', 'jack-home', 5000);
    expect(screen.getByTestId('storybook-scene').dataset.scene).toBe('jack-home');
    ['sb-jack', 'sb-mother', 'sb-cow', 'sb-cottage'].forEach(visible);
  });
  it('the trader offers glowing beans for the cow, then leaves with her', () => {
    show('beanstalk', 'jack-trade', 7000);
    ['sb-jack', 'sb-cow', 'sb-trader', 'sb-beans', 'sb-rope'].forEach(visible);
    expect(screen.getByTestId('sb-trader').dataset.pose).toBe('offer');
    cleanup();
    show('beanstalk', 'jack-trade', 15000);
    expect(screen.getByTestId('sb-trader').dataset.pose).toBe('walk');
    expect(screen.getByTestId('sb-jack').dataset.pose).toBe('beans');
  });
  it('the golden hen lays a golden egg for the visible Giant', () => {
    show('beanstalk', 'jack-hen', 8000);
    ['sb-giant', 'sb-hen', 'sb-golden-egg', 'sb-stool'].forEach(visible);
  });
  it('the Giant sleeps while Jack carries the hen away, then wakes and chases', () => {
    show('beanstalk', 'jack-take', 10000);
    expect(screen.getByTestId('sb-giant').dataset.pose).toBe('sleep');
    expect(screen.getByTestId('sb-jack').dataset.pose).toBe('sneak');
    visible('sb-hen');
    cleanup();
    show('beanstalk', 'jack-chase', 4500);
    expect(screen.getByTestId('sb-giant').dataset.pose).toBe('look');
    cleanup();
    show('beanstalk', 'jack-chase', 11000);
    expect(screen.getByTestId('sb-giant').dataset.pose).toBe('stand');
  });
  it('the beanstalk is chopped and the ending card appears', () => {
    show('beanstalk', 'jack-chop', 7000);
    ['sb-jack', 'sb-mother', 'sb-axe', 'sb-stalk', 'sb-hen'].forEach(visible);
    cleanup();
    show('beanstalk', 'jack-ending', 14000);
    expect(screen.getByTestId('story-endcard')).toHaveTextContent('The End');
    expect(screen.getByTestId('story-endcard')).toHaveTextContent('Adventure Complete!');
  });
  it('the wolf is a visible character from his first scene', () => {
    show('pigs', 'pigs-wolf', 5000);
    visible('sb-wolf');
    expect(screen.getByTestId('sb-wolf').dataset.pose).toBe('sneak');
    visible('sb-wheat-house');
  });
  it('the wheat house blows apart after the wolf huffs and puffs', () => {
    show('pigs', 'pigs-wheat-blow', 5000);
    expect(screen.getByTestId('sb-wolf').dataset.pose).toBe('inhale');
    expect(Number(screen.getByTestId('sb-wheat-house').dataset.blow)).toBe(0);
    cleanup();
    show('pigs', 'pigs-wheat-blow', 10500);
    expect(Number(screen.getByTestId('sb-wheat-house').dataset.blow)).toBeGreaterThan(0.5);
  });
  it('the stone house loses its leafy roof, but its walls stand', () => {
    show('pigs', 'pigs-stone-attack', 14000);
    expect(Number(screen.getByTestId('sb-stone-house').dataset.roofOff)).toBeGreaterThan(0.9);
    expect(Number(screen.getByTestId('sb-stone-house').dataset.build)).toBe(1);
  });
  it('the brick house stands through the strongest gust', () => {
    show('pigs', 'pigs-brick-attack', 16500, [null, 'auto']);
    expect(screen.getByTestId('sb-wolf').dataset.pose).toBe('blow');
    visible('sb-gust');
    expect(Number(screen.getByTestId('sb-brick-house').dataset.build)).toBe(1);
  });
  it('the wolf is outsmarted, splashes into the barrel, and runs away', () => {
    show('pigs', 'pigs-chimney', 9000);
    expect(Number(screen.getByTestId('sb-chimney-lid').parentElement!.closest('[data-lid]')!.getAttribute('data-lid'))).toBe(1);
    cleanup();
    show('pigs', 'pigs-chimney', 14000);
    expect(screen.getByTestId('sb-wolf').dataset.pose).toBe('wet');
    cleanup();
    show('pigs', 'pigs-retreat', 4000);
    expect(screen.getByTestId('sb-wolf').dataset.pose).toBe('run');
  });
  it('all three pigs celebrate together at the end', () => {
    show('pigs', 'pigs-ending', 10000);
    ['sb-pig-one', 'sb-pig-two', 'sb-pig-three'].forEach(visible);
    expect(screen.queryByTestId('sb-wolf')).toBeNull();
    expect(screen.getByTestId('story-endcard')).toHaveTextContent('Adventure Complete!');
  });
});

describe('autoplay through the player (camera off, no input)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });
  it.each(['beanstalk', 'pigs'] as const)(
    '%s plays every scene in order, keeps captions in sync, and finishes',
    (storyId) => {
      const router = createMemoryRouter(
        [
          { path: '/library/:storyId/play', element: <StoryPlayerPage /> },
          { path: '/library/:storyId/complete', element: <h1>Story complete</h1> },
        ],
        { initialEntries: [`/library/${storyId}/play`] },
      );
      render(
        <SessionProvider>
          <RouterProvider router={router} />
        </SessionProvider>,
      );
      const scenes = STORY_SCENES[storyId];
      const seen: string[] = [];
      for (const scene of scenes) {
        // Wait for this scene's caption (invitations hold story time; they resolve on their own).
        for (let guard = 0; guard < 400 && !screen.queryByText(scene.narration); guard++)
          act(() => vi.advanceTimersByTime(200));
        expect(screen.getByText(scene.narration)).toBeInTheDocument();
        expect(screen.getByText(scene.title)).toBeInTheDocument();
        seen.push(scene.id);
        // Mid-scene, the picture shows the same scene as the caption.
        act(() => vi.advanceTimersByTime(scene.durationMs / 2));
        const picture = document.querySelector<HTMLElement>('[data-testid="storybook-scene"]');
        if (screen.queryByText(scene.narration) && picture)
          expect(picture.dataset.scene).toBe(scene.id);
      }
      expect(seen).toEqual(scenes.map((scene) => scene.id));
      act(() => vi.advanceTimersByTime(60000));
      expect(screen.getByText('Story complete')).toBeInTheDocument();
    },
    30000,
  );
});
