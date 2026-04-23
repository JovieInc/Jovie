'use client';

import {
  AbsoluteFill,
  Audio,
  Img,
  interpolate,
  Sequence,
  useCurrentFrame,
} from 'remotion';
/**
 * Nine Content Pack Remotion compositions that share the reel template
 * input shape. Kept as a local type (not imported from the server-only
 * schema module) so compositions stay client-bundle-safe.
 */

export type PackProps = {
  readonly artistName: string;
  readonly releaseTitle: string;
  readonly releaseDate: string | null;
  readonly artworkUrl: string | null;
  readonly watermark: boolean;
  readonly lyricHook?: string | null;
  readonly waveformPeaks?: readonly number[] | null;
  readonly previewAudioUrl?: string | null;
};

const SANS = 'system-ui, -apple-system, sans-serif';

const DEFAULT_PACK_PROPS: PackProps = {
  artistName: 'Tim White',
  releaseTitle: 'The Deep End',
  releaseDate: null,
  artworkUrl: null,
  watermark: true,
  lyricHook: null,
  waveformPeaks: null,
  previewAudioUrl: null,
};

const FPS = 30;

export const PACK_DEFAULT_PROPS = DEFAULT_PACK_PROPS;
export const PACK_FPS = FPS;

// ────────────────────────────────────────────────────────────────────────────
// Shared building blocks
// ────────────────────────────────────────────────────────────────────────────

function Watermark({ enabled }: { readonly enabled: boolean }) {
  if (!enabled) return null;
  return (
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
          fontFamily: SANS,
          fontSize: 22,
          fontWeight: 500,
          letterSpacing: 1,
        }}
      >
        jov.ie
      </div>
    </AbsoluteFill>
  );
}

function ArtworkBackground({
  artworkUrl,
  scale = 1,
  blur = 0,
  overlay = 0.55,
}: {
  readonly artworkUrl: string | null;
  readonly scale?: number;
  readonly blur?: number;
  readonly overlay?: number;
}) {
  if (!artworkUrl) {
    return (
      <AbsoluteFill
        style={{
          backgroundColor: '#0a0a0a',
          backgroundImage:
            'radial-gradient(circle at 50% 40%, #1a1a1a 0%, #000 75%)',
        }}
      />
    );
  }
  return (
    <>
      <AbsoluteFill
        style={{
          transform: `scale(${scale})`,
          transformOrigin: 'center center',
          filter: blur ? `blur(${blur}px)` : undefined,
        }}
      >
        <Img
          src={artworkUrl}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      </AbsoluteFill>
      <AbsoluteFill style={{ backgroundColor: `rgba(0,0,0,${overlay})` }} />
    </>
  );
}

function WaveformBars({
  peaks,
  width,
  height,
  color = '#fff',
  progress = 1,
}: {
  readonly peaks: readonly number[] | null | undefined;
  readonly width: number;
  readonly height: number;
  readonly color?: string;
  readonly progress?: number;
}) {
  if (!peaks || peaks.length === 0) return null;
  const barGap = 2;
  const barWidth = Math.max(1, Math.floor(width / peaks.length) - barGap);
  const shown = Math.floor(peaks.length * Math.max(0, Math.min(1, progress)));
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width,
        height,
        gap: barGap,
      }}
    >
      {peaks.slice(0, shown).map((peak, i) => (
        <div
          key={i}
          style={{
            width: barWidth,
            height: Math.max(4, peak * height),
            backgroundColor: color,
            borderRadius: 2,
          }}
        />
      ))}
    </div>
  );
}

function formatReleaseChip(releaseDate: string | null): string {
  if (!releaseDate) return 'New Release';
  const date = new Date(releaseDate);
  if (Number.isNaN(date.getTime())) return 'New Release';
  const now = Date.now();
  const diffDays = Math.floor((date.getTime() - now) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return 'Out Now';
  if (diffDays === 0) return 'Out Today';
  if (diffDays <= 7) {
    return `Out ${date.toLocaleDateString('en-US', { weekday: 'long' })}`;
  }
  return `Out ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
}

// ────────────────────────────────────────────────────────────────────────────
// 1. Lyric-hook reel (1080×1920, 8s)
// ────────────────────────────────────────────────────────────────────────────

export const LYRIC_HOOK_WIDTH = 1080;
export const LYRIC_HOOK_HEIGHT = 1920;
export const LYRIC_HOOK_FRAMES = 8 * FPS;

export function LyricHookReel(props: PackProps) {
  const frame = useCurrentFrame();
  const { lyricHook, artistName, releaseTitle, artworkUrl, watermark } = props;
  const hook = lyricHook?.trim() || releaseTitle;
  const fade = interpolate(frame, [0, 20], [0, 1], {
    extrapolateRight: 'clamp',
  });
  const scale = interpolate(frame, [0, LYRIC_HOOK_FRAMES], [1.0, 1.05], {
    extrapolateRight: 'clamp',
  });
  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      <ArtworkBackground
        artworkUrl={artworkUrl}
        scale={scale}
        blur={16}
        overlay={0.6}
      />
      <AbsoluteFill
        style={{
          alignItems: 'center',
          justifyContent: 'center',
          padding: 80,
          opacity: fade,
        }}
      >
        <div
          style={{
            color: '#fff',
            fontFamily: SANS,
            fontSize: 86,
            fontWeight: 800,
            letterSpacing: -2,
            lineHeight: 1.1,
            textAlign: 'center',
            textShadow: '0 4px 24px rgba(0,0,0,0.6)',
          }}
        >
          “{hook}”
        </div>
        <div
          style={{
            marginTop: 40,
            color: 'rgba(255,255,255,0.85)',
            fontFamily: SANS,
            fontSize: 36,
            letterSpacing: 1,
            textTransform: 'uppercase',
          }}
        >
          {artistName}
        </div>
      </AbsoluteFill>
      <Watermark enabled={watermark} />
    </AbsoluteFill>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// 2. Visualizer-hook reel (1080×1920, 8s)
// ────────────────────────────────────────────────────────────────────────────

export const VISUALIZER_WIDTH = 1080;
export const VISUALIZER_HEIGHT = 1920;
export const VISUALIZER_FRAMES = 8 * FPS;

export function VisualizerHookReel(props: PackProps) {
  const frame = useCurrentFrame();
  const { waveformPeaks, artistName, releaseTitle, artworkUrl, watermark } =
    props;
  const progress = frame / VISUALIZER_FRAMES;
  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      <ArtworkBackground artworkUrl={artworkUrl} scale={1.1} overlay={0.5} />
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
        <WaveformBars
          peaks={waveformPeaks}
          width={VISUALIZER_WIDTH - 160}
          height={320}
          progress={progress}
          color='rgba(255,255,255,0.95)'
        />
      </AbsoluteFill>
      <AbsoluteFill
        style={{
          alignItems: 'center',
          justifyContent: 'flex-end',
          paddingBottom: 200,
        }}
      >
        <div
          style={{
            color: '#fff',
            fontFamily: SANS,
            fontSize: 78,
            fontWeight: 800,
            letterSpacing: -1,
            textAlign: 'center',
          }}
        >
          {releaseTitle}
        </div>
        <div
          style={{
            marginTop: 16,
            color: 'rgba(255,255,255,0.85)',
            fontFamily: SANS,
            fontSize: 38,
            letterSpacing: 1,
          }}
        >
          {artistName}
        </div>
      </AbsoluteFill>
      <Watermark enabled={watermark} />
    </AbsoluteFill>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// 3. IG square quote (1080×1080, 15s)
// ────────────────────────────────────────────────────────────────────────────

export const IG_SQUARE_WIDTH = 1080;
export const IG_SQUARE_HEIGHT = 1080;
export const IG_SQUARE_FRAMES = 15 * FPS;

export function IgSquareQuote(props: PackProps) {
  const { lyricHook, artistName, releaseTitle, artworkUrl, watermark } = props;
  const hook = lyricHook?.trim() || releaseTitle;
  return (
    <AbsoluteFill style={{ backgroundColor: '#111' }}>
      <ArtworkBackground artworkUrl={artworkUrl} blur={30} overlay={0.7} />
      <AbsoluteFill
        style={{
          alignItems: 'center',
          justifyContent: 'center',
          padding: 80,
        }}
      >
        <div
          style={{
            color: '#fff',
            fontFamily: SANS,
            fontSize: 68,
            fontWeight: 700,
            lineHeight: 1.15,
            textAlign: 'center',
          }}
        >
          “{hook}”
        </div>
        <div
          style={{
            marginTop: 36,
            color: 'rgba(255,255,255,0.8)',
            fontFamily: SANS,
            fontSize: 30,
            letterSpacing: 2,
            textTransform: 'uppercase',
          }}
        >
          {artistName} · {releaseTitle}
        </div>
      </AbsoluteFill>
      <Watermark enabled={watermark} />
    </AbsoluteFill>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// 4. IG square waveform (1080×1080, 15s)
// ────────────────────────────────────────────────────────────────────────────

export function IgSquareWaveform(props: PackProps) {
  const frame = useCurrentFrame();
  const { waveformPeaks, artistName, releaseTitle, artworkUrl, watermark } =
    props;
  const progress = frame / IG_SQUARE_FRAMES;
  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      <AbsoluteFill style={{ padding: 80 }}>
        {artworkUrl ? (
          <Img
            src={artworkUrl}
            style={{
              width: '100%',
              height: '60%',
              objectFit: 'cover',
              borderRadius: 24,
            }}
          />
        ) : null}
      </AbsoluteFill>
      <AbsoluteFill
        style={{
          alignItems: 'center',
          justifyContent: 'flex-end',
          paddingBottom: 80,
        }}
      >
        <WaveformBars
          peaks={waveformPeaks}
          width={IG_SQUARE_WIDTH - 160}
          height={120}
          progress={progress}
        />
        <div
          style={{
            marginTop: 24,
            color: '#fff',
            fontFamily: SANS,
            fontSize: 44,
            fontWeight: 700,
          }}
        >
          {releaseTitle}
        </div>
        <div
          style={{
            color: 'rgba(255,255,255,0.75)',
            fontFamily: SANS,
            fontSize: 26,
            letterSpacing: 1,
            textTransform: 'uppercase',
          }}
        >
          {artistName}
        </div>
      </AbsoluteFill>
      <Watermark enabled={watermark} />
    </AbsoluteFill>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// 5. IG story countdown (1080×1920, 5s)
// ────────────────────────────────────────────────────────────────────────────

export const IG_STORY_WIDTH = 1080;
export const IG_STORY_HEIGHT = 1920;
export const IG_STORY_FRAMES = 5 * FPS;

export function IgStoryCountdown(props: PackProps) {
  const { releaseDate, releaseTitle, artistName, artworkUrl, watermark } =
    props;
  const chip = formatReleaseChip(releaseDate);
  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      <ArtworkBackground artworkUrl={artworkUrl} overlay={0.6} />
      <AbsoluteFill
        style={{
          alignItems: 'center',
          justifyContent: 'center',
          padding: 80,
        }}
      >
        <div
          style={{
            padding: '14px 36px',
            borderRadius: 9999,
            backgroundColor: 'rgba(255,255,255,0.2)',
            color: '#fff',
            fontFamily: SANS,
            fontSize: 42,
            fontWeight: 700,
            letterSpacing: 3,
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
            fontFamily: SANS,
            fontSize: 96,
            fontWeight: 800,
            letterSpacing: -2,
            textAlign: 'center',
            lineHeight: 1,
          }}
        >
          {releaseTitle}
        </div>
        <div
          style={{
            marginTop: 24,
            color: 'rgba(255,255,255,0.85)',
            fontFamily: SANS,
            fontSize: 44,
            fontWeight: 500,
          }}
        >
          {artistName}
        </div>
      </AbsoluteFill>
      <Watermark enabled={watermark} />
    </AbsoluteFill>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// 6. IG story cover (1080×1920, 5s)
// ────────────────────────────────────────────────────────────────────────────

export function IgStoryCover(props: PackProps) {
  const { releaseDate, releaseTitle, artistName, artworkUrl, watermark } =
    props;
  return (
    <AbsoluteFill style={{ backgroundColor: '#0a0a0a' }}>
      <AbsoluteFill
        style={{
          alignItems: 'center',
          justifyContent: 'center',
          padding: 100,
        }}
      >
        {artworkUrl ? (
          <Img
            src={artworkUrl}
            style={{
              width: 780,
              height: 780,
              objectFit: 'cover',
              borderRadius: 16,
              boxShadow: '0 40px 80px rgba(0,0,0,0.7)',
            }}
          />
        ) : null}
        <div
          style={{
            marginTop: 60,
            color: '#fff',
            fontFamily: SANS,
            fontSize: 72,
            fontWeight: 800,
            letterSpacing: -1,
            textAlign: 'center',
          }}
        >
          {releaseTitle}
        </div>
        <div
          style={{
            marginTop: 12,
            color: 'rgba(255,255,255,0.75)',
            fontFamily: SANS,
            fontSize: 34,
            letterSpacing: 2,
            textTransform: 'uppercase',
          }}
        >
          {artistName} · {formatReleaseChip(releaseDate)}
        </div>
      </AbsoluteFill>
      <Watermark enabled={watermark} />
    </AbsoluteFill>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// 7. Audiogram vertical (1080×1920, 20s) — bakes in preview audio
// ────────────────────────────────────────────────────────────────────────────

export const AUDIOGRAM_V_FRAMES = 20 * FPS;

export function AudiogramVertical(props: PackProps) {
  const frame = useCurrentFrame();
  const {
    previewAudioUrl,
    waveformPeaks,
    lyricHook,
    artistName,
    releaseTitle,
    artworkUrl,
    watermark,
  } = props;
  const progress = frame / AUDIOGRAM_V_FRAMES;
  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      <ArtworkBackground artworkUrl={artworkUrl} blur={28} overlay={0.5} />
      {previewAudioUrl ? <Audio src={previewAudioUrl} /> : null}
      <AbsoluteFill
        style={{
          alignItems: 'center',
          justifyContent: 'center',
          padding: 80,
          gap: 48,
        }}
      >
        {artworkUrl ? (
          <Img
            src={artworkUrl}
            style={{
              width: 600,
              height: 600,
              objectFit: 'cover',
              borderRadius: 24,
            }}
          />
        ) : null}
        <WaveformBars
          peaks={waveformPeaks}
          width={IG_STORY_WIDTH - 160}
          height={140}
          progress={progress}
        />
        <div
          style={{
            color: '#fff',
            fontFamily: SANS,
            fontSize: 42,
            fontWeight: 600,
            textAlign: 'center',
            padding: '0 40px',
          }}
        >
          {lyricHook?.trim() || `${artistName} · ${releaseTitle}`}
        </div>
      </AbsoluteFill>
      <Watermark enabled={watermark} />
    </AbsoluteFill>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// 8. Audiogram landscape (1920×1080, 20s)
// ────────────────────────────────────────────────────────────────────────────

export const AUDIOGRAM_L_WIDTH = 1920;
export const AUDIOGRAM_L_HEIGHT = 1080;
export const AUDIOGRAM_L_FRAMES = 20 * FPS;

export function AudiogramLandscape(props: PackProps) {
  const frame = useCurrentFrame();
  const {
    previewAudioUrl,
    waveformPeaks,
    artistName,
    releaseTitle,
    artworkUrl,
    lyricHook,
    watermark,
  } = props;
  const progress = frame / AUDIOGRAM_L_FRAMES;
  return (
    <AbsoluteFill style={{ backgroundColor: '#050505' }}>
      <ArtworkBackground artworkUrl={artworkUrl} blur={40} overlay={0.65} />
      {previewAudioUrl ? <Audio src={previewAudioUrl} /> : null}
      <AbsoluteFill
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          padding: 80,
          gap: 80,
        }}
      >
        {artworkUrl ? (
          <Img
            src={artworkUrl}
            style={{
              width: 720,
              height: 720,
              objectFit: 'cover',
              borderRadius: 24,
              boxShadow: '0 30px 60px rgba(0,0,0,0.6)',
            }}
          />
        ) : null}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
          <div
            style={{
              color: '#fff',
              fontFamily: SANS,
              fontSize: 72,
              fontWeight: 800,
              letterSpacing: -1,
            }}
          >
            {releaseTitle}
          </div>
          <div
            style={{
              color: 'rgba(255,255,255,0.8)',
              fontFamily: SANS,
              fontSize: 34,
              letterSpacing: 2,
              textTransform: 'uppercase',
            }}
          >
            {artistName}
          </div>
          {lyricHook ? (
            <div
              style={{
                color: 'rgba(255,255,255,0.85)',
                fontFamily: SANS,
                fontSize: 38,
                maxWidth: 900,
              }}
            >
              “{lyricHook}”
            </div>
          ) : null}
          <WaveformBars
            peaks={waveformPeaks}
            width={900}
            height={100}
            progress={progress}
          />
        </div>
      </AbsoluteFill>
      <Watermark enabled={watermark} />
    </AbsoluteFill>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// 9. YouTube Shorts (1080×1920, 15s)
// ────────────────────────────────────────────────────────────────────────────

export const YT_SHORTS_FRAMES = 15 * FPS;

export function YoutubeShorts(props: PackProps) {
  const frame = useCurrentFrame();
  const { artistName, releaseTitle, artworkUrl, releaseDate, watermark } =
    props;
  const zoom = interpolate(frame, [0, YT_SHORTS_FRAMES], [1.0, 1.15], {
    extrapolateRight: 'clamp',
  });
  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      <ArtworkBackground artworkUrl={artworkUrl} scale={zoom} overlay={0.4} />
      <Sequence from={12}>
        <AbsoluteFill
          style={{
            alignItems: 'center',
            justifyContent: 'flex-end',
            paddingBottom: 240,
          }}
        >
          <div
            style={{
              padding: '10px 28px',
              borderRadius: 9999,
              backgroundColor: '#ff0033',
              color: '#fff',
              fontFamily: SANS,
              fontSize: 30,
              fontWeight: 700,
              letterSpacing: 2,
              textTransform: 'uppercase',
              marginBottom: 36,
            }}
          >
            New Release
          </div>
          <div
            style={{
              color: '#fff',
              fontFamily: SANS,
              fontSize: 96,
              fontWeight: 800,
              letterSpacing: -2,
              textAlign: 'center',
              padding: '0 60px',
              lineHeight: 1,
            }}
          >
            {releaseTitle}
          </div>
          <div
            style={{
              marginTop: 24,
              color: 'rgba(255,255,255,0.9)',
              fontFamily: SANS,
              fontSize: 42,
              fontWeight: 500,
            }}
          >
            {artistName} · {formatReleaseChip(releaseDate)}
          </div>
        </AbsoluteFill>
      </Sequence>
      <Watermark enabled={watermark} />
    </AbsoluteFill>
  );
}
