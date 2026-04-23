'use client';

import { Composition } from 'remotion';
import {
  AUDIOGRAM_L_FRAMES,
  AUDIOGRAM_L_HEIGHT,
  AUDIOGRAM_L_WIDTH,
  AUDIOGRAM_V_FRAMES,
  AudiogramLandscape,
  AudiogramVertical,
  IG_SQUARE_FRAMES,
  IG_SQUARE_HEIGHT,
  IG_SQUARE_WIDTH,
  IG_STORY_FRAMES,
  IG_STORY_HEIGHT,
  IG_STORY_WIDTH,
  IgSquareQuote,
  IgSquareWaveform,
  IgStoryCountdown,
  IgStoryCover,
  LYRIC_HOOK_FRAMES,
  LYRIC_HOOK_HEIGHT,
  LYRIC_HOOK_WIDTH,
  LyricHookReel,
  PACK_DEFAULT_PROPS,
  PACK_FPS,
  type PackProps,
  VISUALIZER_FRAMES,
  VISUALIZER_HEIGHT,
  VISUALIZER_WIDTH,
  VisualizerHookReel,
  YoutubeShorts,
  YT_SHORTS_FRAMES,
} from './pack-formats';
import {
  TEASER_V1_DURATION_FRAMES,
  TEASER_V1_FPS,
  TEASER_V1_HEIGHT,
  TEASER_V1_WIDTH,
  TeaserV1,
  type TeaserV1Props,
} from './TeaserV1';

const DEFAULT_TEASER_PROPS: TeaserV1Props = {
  artistName: 'Tim White',
  releaseTitle: 'The Deep End',
  releaseDate: null,
  artworkUrl: null,
  watermark: true,
};

const DEFAULT_PACK_PROPS: PackProps = PACK_DEFAULT_PROPS;

export function RemotionRoot() {
  return (
    <>
      <Composition
        id='teaser-v1'
        component={TeaserV1}
        durationInFrames={TEASER_V1_DURATION_FRAMES}
        fps={TEASER_V1_FPS}
        width={TEASER_V1_WIDTH}
        height={TEASER_V1_HEIGHT}
        defaultProps={DEFAULT_TEASER_PROPS}
      />
      <Composition
        id='lyric-hook-v1'
        component={LyricHookReel}
        durationInFrames={LYRIC_HOOK_FRAMES}
        fps={PACK_FPS}
        width={LYRIC_HOOK_WIDTH}
        height={LYRIC_HOOK_HEIGHT}
        defaultProps={DEFAULT_PACK_PROPS}
      />
      <Composition
        id='visualizer-hook-v1'
        component={VisualizerHookReel}
        durationInFrames={VISUALIZER_FRAMES}
        fps={PACK_FPS}
        width={VISUALIZER_WIDTH}
        height={VISUALIZER_HEIGHT}
        defaultProps={DEFAULT_PACK_PROPS}
      />
      <Composition
        id='ig-square-quote-v1'
        component={IgSquareQuote}
        durationInFrames={IG_SQUARE_FRAMES}
        fps={PACK_FPS}
        width={IG_SQUARE_WIDTH}
        height={IG_SQUARE_HEIGHT}
        defaultProps={DEFAULT_PACK_PROPS}
      />
      <Composition
        id='ig-square-waveform-v1'
        component={IgSquareWaveform}
        durationInFrames={IG_SQUARE_FRAMES}
        fps={PACK_FPS}
        width={IG_SQUARE_WIDTH}
        height={IG_SQUARE_HEIGHT}
        defaultProps={DEFAULT_PACK_PROPS}
      />
      <Composition
        id='ig-story-countdown-v1'
        component={IgStoryCountdown}
        durationInFrames={IG_STORY_FRAMES}
        fps={PACK_FPS}
        width={IG_STORY_WIDTH}
        height={IG_STORY_HEIGHT}
        defaultProps={DEFAULT_PACK_PROPS}
      />
      <Composition
        id='ig-story-cover-v1'
        component={IgStoryCover}
        durationInFrames={IG_STORY_FRAMES}
        fps={PACK_FPS}
        width={IG_STORY_WIDTH}
        height={IG_STORY_HEIGHT}
        defaultProps={DEFAULT_PACK_PROPS}
      />
      <Composition
        id='audiogram-vertical-v1'
        component={AudiogramVertical}
        durationInFrames={AUDIOGRAM_V_FRAMES}
        fps={PACK_FPS}
        width={IG_STORY_WIDTH}
        height={IG_STORY_HEIGHT}
        defaultProps={DEFAULT_PACK_PROPS}
      />
      <Composition
        id='audiogram-landscape-v1'
        component={AudiogramLandscape}
        durationInFrames={AUDIOGRAM_L_FRAMES}
        fps={PACK_FPS}
        width={AUDIOGRAM_L_WIDTH}
        height={AUDIOGRAM_L_HEIGHT}
        defaultProps={DEFAULT_PACK_PROPS}
      />
      <Composition
        id='youtube-shorts-v1'
        component={YoutubeShorts}
        durationInFrames={YT_SHORTS_FRAMES}
        fps={PACK_FPS}
        width={IG_STORY_WIDTH}
        height={IG_STORY_HEIGHT}
        defaultProps={DEFAULT_PACK_PROPS}
      />
    </>
  );
}
