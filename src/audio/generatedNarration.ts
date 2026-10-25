import type { StoryId } from '../engine/types';
import { generatedNarrationManifest } from '../data/stories/generatedNarrationManifest';

export type GeneratedNarrationTrack = {
  url: string;
  text: string;
  durationMs: number | null;
  model: string;
  voice: string;
};

const manifest = generatedNarrationManifest as Record<
  string,
  GeneratedNarrationTrack
>;

export function narrationKey(storyId: StoryId, sceneId: string) {
  return `${storyId}:${sceneId}`;
}

/**
 * Returns a generated track only when it was made from the exact current caption.
 * Editing a story therefore cannot silently leave stale narration attached to it.
 */
export function generatedNarrationFor(
  storyId: StoryId,
  sceneId: string,
  canonicalText: string,
) {
  const track = manifest[narrationKey(storyId, sceneId)];
  return track?.text === canonicalText ? track : undefined;
}
