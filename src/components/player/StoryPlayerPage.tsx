import { useEffect, useReducer, useRef, useState } from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { getStoryById } from '../../data/stories/registry';
import type { StorySummary } from '../../data/stories/registry';
import { sceneAt, STORY_SCENES } from '../../data/stories/scenes';
import { buttonFor, PROMPTS, reaction } from '../../data/stories/momentCopy';
import { StoryNotFound } from '../library/StoryNotFound';
import { useSession } from '../../app/SessionContext';
import { routes } from '../../app/router';
import { PlayerToolbar } from './PlayerToolbar';
import { NarrationPanel } from './NarrationPanel';
import { GestureHint } from './GestureHint';
import { PauseDialog } from './PauseDialog';
import { GestureCamera } from '../gesture/GestureCamera';
import { AnimatedStoryScene } from '../../rendering/AnimatedStoryScene';
import {
  automaticStoryReducer,
  initialAutomaticStory,
  SCRIPTS,
} from '../../engine/automaticStory';
import type { BodyGesture } from '../../vision/bodyGestures';
import { playSfx, unlockSfx } from '../../audio/sfx';
import type { Sfx } from '../../audio/sfx';
import { useNarration } from '../../hooks/useNarration';
import { generatedNarrationFor } from '../../audio/generatedNarration';
import './automaticStory.css';

export function StoryPlayerPage() {
  const { storyId } = useParams<{ storyId: string }>();
  const story = storyId ? getStoryById(storyId) : undefined;
  return story ? (
    <AutomaticStoryPlayer key={story.id} story={story} />
  ) : (
    <StoryNotFound />
  );
}

function AutomaticStoryPlayer({ story }: { story: StorySummary }) {
  const navigate = useNavigate();
  const { characterId, audioEnabled, toggleAudio } = useSession();
  const [state, dispatch] = useReducer(
    automaticStoryReducer,
    story.id,
    (storyId) => ({ ...initialAutomaticStory(storyId), cameraBusy: true }),
  );
  const MOMENTS = SCRIPTS[story.id].moments;
  const character =
    story.characters.find((candidate) => candidate.id === characterId) ??
    story.characters[0];
  // One active scene drives the caption, the spoken line, the chapter label and the picture.
  const active = sceneAt(story.id, state.elapsed);
  const text = active.scene.narration;
  const lastScene = active.index === SCENE_COUNT[story.id] - 1;
  const narrationTrack = generatedNarrationFor(
    story.id,
    active.scene.id,
    active.scene.narration,
  );
  const nextScene = STORY_SCENES[story.id][active.index + 1];
  const nextNarrationTrack = nextScene
    ? generatedNarrationFor(story.id, nextScene.id, nextScene.narration)
    : undefined;
  // A new id per scene and per restart: each line is spoken once, never per render.
  const [run, setRun] = useState(0);
  const replayNarration = useNarration(
    `${story.id}:${run}:${active.scene.id}`,
    text,
    audioEnabled,
    state.paused || state.cameraBusy || state.interaction === 'open',
    narrationTrack?.url,
    narrationTrack?.durationMs,
    active.scene.durationMs,
    nextNarrationTrack?.url,
    () =>
      dispatch({
        type: 'NARRATION_FINISHED',
        sceneId: active.scene.id,
      }),
  );
  // A muted story cannot emit an audio-ended event. Once it reaches a hidden
  // challenge, let the child continue without waiting for sound they disabled.
  useEffect(() => {
    if (!audioEnabled && state.interaction === 'pending')
      dispatch({
        type: 'NARRATION_FINISHED',
        sceneId: active.scene.id,
      });
  }, [audioEnabled, active.scene.id, state.interaction]);
  useEffect(() => {
    if (state.paused || state.cameraBusy || state.finished) return;
    let last = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now();
      dispatch({ type: 'TICK', ms: now - last });
      last = now;
    }, 200);
    return () => window.clearInterval(timer);
  }, [state.paused, state.cameraBusy, state.finished]);
  useEffect(() => {
    if (state.finished) void navigate(routes.complete(story.id));
  }, [state.finished, navigate, story.id]);
  useEffect(() => {
    const hide = () => {
      if (document.hidden) dispatch({ type: 'PAUSE', paused: true });
    };
    document.addEventListener('visibilitychange', hide);
    return () => document.removeEventListener('visibilitychange', hide);
  }, []);
  const name = character.name;
  const open = state.interaction === 'open';
  // The gesture the camera is in the middle of recognizing ("Almost there…").
  const [forming, setForming] = useState<BodyGesture | null>(null);
  const momentId = MOMENTS[state.moment]?.id;
  const lastIndex = state.moment - 1;
  const lastMomentId = MOMENTS[lastIndex]?.id;
  const outcomes = state.responses.map((gesture, index) =>
    gesture ?? (state.auto[index] ? ('auto' as const) : null),
  );
  const lastOutcome = lastIndex >= 0 ? outcomes[lastIndex] : null;
  // Remember when the latest moment resolved, so its caption can retire after a while.
  const resolvedKey = `${run}:${lastIndex}`;
  const [resolved, setResolved] = useState({ key: '', at: 0 });
  if (lastIndex >= 0 && resolved.key !== resolvedKey)
    setResolved({ key: resolvedKey, at: state.elapsed });
  const freshOutcome =
    lastOutcome && state.elapsed < resolved.at + CAPTION_MS ? lastOutcome : null;
  // Challenge outcomes stay visual and use sound effects only; narration is
  // reserved for authored story scenes so a browser voice never interrupts Muse.
  const sound = (cue: Sfx) => {
    playSfx(cue); // follows the global sound-effects switch
  };
  const soundRef = useRef(sound);
  useEffect(() => {
    soundRef.current = sound;
  });
  useEffect(() => {
    if (open) soundRef.current('invite');
  }, [open, state.moment]);
  useEffect(() => {
    if (state.gesture) soundRef.current(GESTURE_SFX[state.gesture]);
  }, [state.gesture, state.responses]);
  // Cinema mode: the scene, captions and invitation fill the screen together.
  const column = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const fullscreenSupported =
    typeof document !== 'undefined' && document.fullscreenEnabled === true;
  useEffect(() => {
    const sync = () =>
      setIsFullscreen(document.fullscreenElement === column.current);
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);
  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void column.current?.requestFullscreen().catch(() => {});
  };
  const restart = () => {
    dispatch({ type: 'RESTART' });
    setRun((value) => value + 1);
  };
  return (
    <section className="automatic-player" onPointerDown={unlockSfx}>
      <div inert={state.paused || undefined}>
        <PlayerToolbar
          title={story.title}
          chapterLabel={active.scene.title}
          muted={!audioEnabled}
          onToggleMute={toggleAudio}
          onPause={() => dispatch({ type: 'PAUSE', paused: true })}
          onRestart={restart}
        />
        <div className="player-layout">
          <div
            className={`story-column theater${open ? ' is-asking' : ''}${freshOutcome && freshOutcome !== 'auto' && !open ? ' is-celebrating' : ''}`}
            ref={column}
          >
            <div className="scene-frame">
              {fullscreenSupported && (
                <button
                  type="button"
                  className="scene-fullscreen"
                  aria-label={isFullscreen ? 'Exit full screen' : 'Full screen'}
                  onClick={toggleFullscreen}
                >
                  {isFullscreen ? (
                    <Minimize2 size={20} aria-hidden="true" />
                  ) : (
                    <Maximize2 size={20} aria-hidden="true" />
                  )}
                </button>
              )}
              <AnimatedStoryScene
                storyId={story.id}
                characterId={character.id}
                elapsed={state.elapsed}
                magic={state.magic}
                gesture={state.gesture}
                outcomes={outcomes}
                openMoment={open ? state.moment : null}
                onFinishLine={() => soundRef.current('finish')}
                paused={state.paused || state.cameraBusy}
              />
              <div
                key={open ? `ask-${state.moment}` : `after-${state.moment}`}
                className={`magic-invitation ${open ? 'is-open' : ''}${!open && freshOutcome && freshOutcome !== 'auto' ? ' is-success' : ''}${lastScene && !open ? ' is-quiet' : ''}`}
                aria-live="polite"
              >
                {open && momentId ? (
                  <>
                    <div className="invite-head">
                      <GestureHint gesture={MOMENTS[state.moment].accepts[0]} />
                      <p>
                        <strong>{PROMPTS[momentId].title(name)}</strong>{' '}
                        <span className="invite-body">
                          {PROMPTS[momentId].body} You can just watch, too!
                        </span>
                      </p>
                    </div>
                    {forming && (
                      <p className="invite-almost" role="status">
                        Almost there…
                      </p>
                    )}
                    <div className="invite-timer" aria-hidden="true">
                      <span
                        style={{
                          width: `${(state.remaining / MOMENTS[state.moment].windowMs) * 100}%`,
                        }}
                      />
                    </div>
                    <div className="story-actions">
                      {MOMENTS[state.moment].accepts.map((gesture) => (
                        <button
                          key={gesture}
                          data-sfx="none"
                          className="btn btn--secondary"
                          aria-label={buttonFor(momentId, gesture).label}
                          onClick={() =>
                            dispatch(
                              gesture === 'HAND_RAISE'
                                ? { type: 'MAGIC_ACTIVATE' }
                                : { type: gesture },
                            )
                          }
                        >
                          {buttonFor(momentId, gesture).text}
                          <small>{buttonFor(momentId, gesture).hint}</small>
                        </button>
                      ))}
                    </div>
                  </>
                ) : lastScene ? (
                  // The picture shows its own "The End" card; keep the sky clear for it.
                  <p className="invite-quiet">{story.moral}</p>
                ) : freshOutcome && lastMomentId ? (
                  <p>
                    <strong>
                      {freshOutcome === 'auto' ? 'No problem!' : '✨ You did it!'}
                    </strong>{' '}
                    {reaction(lastMomentId, freshOutcome, name).caption}
                  </p>
                ) : (
                  <p>
                    {state.cameraBusy
                      ? 'Allow the camera, then your story will begin!'
                      : state.moment > 0
                        ? 'On with the adventure!'
                        : 'Sit back and enjoy. A little surprise is coming soon!'}
                  </p>
                )}
              </div>
            </div>
            <div className="theater-bottom">
              <NarrationPanel
                variant="subtitle"
                speaker={narrationTrack ? 'Muse • Gemini Voice ✨' : 'Narrator'}
                text={text}
                onReplay={replayNarration}
              />
              <div className="camera-pip">
                <GestureCamera
                  onAction={dispatch}
                  onGesture={(event) => {
                    if (event.type !== 'HAND_RAISE') dispatch(event);
                  }}
                  onPending={setForming}
                  onStatusChange={(status) =>
                    dispatch({
                      type: 'CAMERA_BUSY',
                      busy: status === 'requesting' || status === 'loading',
                    })
                  }
                />
              </div>
            </div>
          </div>
        </div>
      </div>
      {state.paused && (
        <PauseDialog
          onResume={() => dispatch({ type: 'PAUSE', paused: false })}
          onReplayInstruction={() => {
            dispatch({ type: 'PAUSE', paused: false });
            replayNarration();
          }}
          onRestartStory={restart}
          onExitToLibrary={() => navigate(routes.library())}
        />
      )}
    </section>
  );
}

/** How long (story ms) a "You did it!" caption stays before the banner relaxes. */
const CAPTION_MS = 6000;
const GESTURE_SFX: Record<BodyGesture, Sfx> = {
  HAND_RAISE: 'magic',
  LEAN_LEFT: 'path',
  LEAN_RIGHT: 'path',
  ARMS_WIDE: 'shield',
  CROUCH: 'duck',
};
const SCENE_COUNT = {
  hare: STORY_SCENES.hare.length,
  beanstalk: STORY_SCENES.beanstalk.length,
  pigs: STORY_SCENES.pigs.length,
};
