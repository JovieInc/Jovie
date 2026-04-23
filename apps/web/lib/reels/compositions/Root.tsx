'use client';

import { Composition } from 'remotion';
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
    </>
  );
}
