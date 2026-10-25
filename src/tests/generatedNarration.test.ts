import { describe, expect, it } from 'vitest';
import {
  generatedNarrationFor,
  narrationKey,
} from '../audio/generatedNarration';
import { STORY_SCENES } from '../data/stories/scenes';

describe('generated narration manifest', () => {
  it('uses a stable story and scene key', () => {
    expect(narrationKey('hare', 'hare-intro')).toBe('hare:hare-intro');
  });

  it('falls back when no generated track matches the current caption', () => {
    expect(
      generatedNarrationFor('hare', 'hare-intro', 'Changed caption'),
    ).toBeUndefined();
  });

  it('finds a generated track for an unchanged canonical caption', () => {
    const scene = STORY_SCENES.hare[0];
    expect(generatedNarrationFor('hare', scene.id, scene.narration)?.url).toBe(
      '/audio/narration/hare/00-hare-intro.wav',
    );
  });
});
