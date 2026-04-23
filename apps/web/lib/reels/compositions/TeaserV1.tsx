'use client';

import {
  AbsoluteFill,
  Img,
  interpolate,
  Sequence,
  useCurrentFrame,
} from 'remotion';

export type TeaserV1Props = {
  readonly artistName: string;
  readonly releaseTitle: string;
  readonly releaseDate: string | null;
  readonly artworkUrl: string | null;
  readonly watermark: boolean;
};

export const TEASER_V1_FPS = 30;
export const TEASER_V1_WIDTH = 1080;
export const TEASER_V1_HEIGHT = 1920;
export const TEASER_V1_DURATION_FRAMES = 210; // 7 seconds at 30fps

function formatReleaseChip(releaseDate: string | null): string {
  if (!releaseDate) return 'New Release';
  const date = new Date(releaseDate);
  if (Number.isNaN(date.getTime())) return 'New Release';
  const now = Date.now();
  const diffDays = Math.floor((date.getTime() - now) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return 'Out Now';
  if (diffDays === 0) return 'Out Today';
  if (diffDays <= 7) {
    const dow = date.toLocaleDateString('en-US', { weekday: 'long' });
    return `Out ${dow}`;
  }
  const monthDay = date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
  return `Out ${monthDay}`;
}

export function TeaserV1({
  artistName,
  releaseTitle,
  releaseDate,
  artworkUrl,
  watermark,
}: TeaserV1Props) {
  const frame = useCurrentFrame();

  // Artwork zoom: starts at 1.0, slowly zooms to 1.08 across the clip
  const artworkScale = interpolate(
    frame,
    [0, TEASER_V1_DURATION_FRAMES],
    [1, 1.08],
    { extrapolateRight: 'clamp' }
  );

  // Soft fade-in (0-20 frames) + fade-out (last 20 frames)
  const fadeIn = interpolate(frame, [0, 20], [0, 1], {
    extrapolateRight: 'clamp',
  });
  const fadeOut = interpolate(
    frame,
    [TEASER_V1_DURATION_FRAMES - 20, TEASER_V1_DURATION_FRAMES],
    [1, 0],
    { extrapolateLeft: 'clamp' }
  );
  const overlayOpacity = Math.min(fadeIn, fadeOut);

  const chip = formatReleaseChip(releaseDate);

  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      {artworkUrl ? (
        <AbsoluteFill
          style={{
            transform: `scale(${artworkScale})`,
            transformOrigin: 'center center',
          }}
        >
          <Img
            src={artworkUrl}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
            }}
          />
          <AbsoluteFill
            style={{
              background:
                'linear-gradient(to bottom, rgba(0,0,0,0) 40%, rgba(0,0,0,0.55) 80%, rgba(0,0,0,0.85) 100%)',
            }}
          />
        </AbsoluteFill>
      ) : (
        <AbsoluteFill
          style={{
            backgroundColor: '#0a0a0a',
            backgroundImage:
              'radial-gradient(circle at 50% 40%, #1a1a1a 0%, #000 75%)',
          }}
        />
      )}

      <Sequence from={10}>
        <AbsoluteFill
          style={{
            justifyContent: 'flex-end',
            alignItems: 'center',
            paddingBottom: 200,
            opacity: overlayOpacity,
          }}
        >
          <div
            style={{
              padding: '10px 24px',
              borderRadius: 9999,
              backgroundColor: 'rgba(255,255,255,0.18)',
              color: '#fff',
              fontFamily: 'system-ui, -apple-system, sans-serif',
              fontSize: 34,
              fontWeight: 600,
              letterSpacing: 2,
              textTransform: 'uppercase',
              marginBottom: 40,
              backdropFilter: 'blur(12px)',
            }}
          >
            {chip}
          </div>
          <div
            style={{
              color: '#fff',
              fontFamily: 'system-ui, -apple-system, sans-serif',
              fontSize: 92,
              fontWeight: 800,
              letterSpacing: -2,
              textAlign: 'center',
              padding: '0 60px',
              lineHeight: 1,
              textShadow: '0 4px 24px rgba(0,0,0,0.6)',
            }}
          >
            {releaseTitle}
          </div>
          <div
            style={{
              marginTop: 24,
              color: 'rgba(255,255,255,0.85)',
              fontFamily: 'system-ui, -apple-system, sans-serif',
              fontSize: 44,
              fontWeight: 500,
              letterSpacing: 0,
              textAlign: 'center',
            }}
          >
            {artistName}
          </div>
        </AbsoluteFill>
      </Sequence>

      {watermark ? (
        <AbsoluteFill
          style={{
            justifyContent: 'flex-end',
            alignItems: 'flex-end',
            padding: 48,
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              color: 'rgba(255,255,255,0.55)',
              fontFamily: 'system-ui, -apple-system, sans-serif',
              fontSize: 22,
              fontWeight: 500,
              letterSpacing: 1,
            }}
          >
            jov.ie
          </div>
        </AbsoluteFill>
      ) : null}
    </AbsoluteFill>
  );
}
