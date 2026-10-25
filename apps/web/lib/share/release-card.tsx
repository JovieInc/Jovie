/* eslint @next/next/no-img-element: "off" -- ImageResponse requires standard img */
import { getArtworkRadiusPx } from '@/components/atoms/ArtworkFrame';
import palette from '@/design/oklch-palette.json';

export interface ReleaseShareArtwork {
  readonly dataUrl: string;
  readonly width: number;
  readonly height: number;
}

function clampText(input: string, maxLength: number): string {
  return input.length > maxLength
    ? `${input.slice(0, maxLength - 1).trimEnd()}…`
    : input;
}

/**
 * Release smart link share card (JOV-7864). Composed 1200x630 preview:
 * contained sleeve, title at display size, the real artist credit, and the
 * content type with year. Nothing is ever drawn over the sleeve and there is
 * no play affordance — the card is a preview, not a player.
 */
export function renderReleaseShareCard(params: {
  readonly title: string;
  readonly artist: string;
  readonly typeLabel: string;
  readonly year?: number | null;
  readonly handle?: string;
  readonly slug?: string;
  readonly artwork?: ReleaseShareArtwork | null;
}) {
  // Long titles shrink before clipping; extreme ones clamp with an ellipsis
  // so the card never overflows the 1200x630 canvas.
  const title = clampText(params.title, 80);
  const fontSize =
    title.length <= 24
      ? 80
      : title.length <= 40
        ? 72
        : title.length <= 64
          ? 64
          : 48;
  const kicker = params.year
    ? `${params.typeLabel} · ${params.year}`
    : params.typeLabel;
  return (
    <div
      style={{
        display: 'flex',
        position: 'relative',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        padding: 72,
        background: palette.swatches.canvas.dark.hex,
        color: palette.swatches['text-primary'].dark.hex,
        fontFamily: 'Satoshi',
        fontWeight: 700,
      }}
    >
      <div
        style={{
          display: 'flex',
          height: 420,
          flexShrink: 0,
          alignItems: 'center',
          gap: 64,
        }}
      >
        <div
          style={{
            display: 'flex',
            flex: 1,
            flexDirection: 'column',
            alignItems: 'flex-start',
            gap: 24,
          }}
        >
          <div
            style={{
              display: 'flex',
              fontSize: 28,
              color: palette.swatches.ion.dark.hex,
              letterSpacing: '-0.01em',
            }}
          >
            {kicker}
          </div>
          <div
            style={{
              display: 'flex',
              fontSize,
              lineHeight: 1.08,
              letterSpacing: '-0.025em',
              wordBreak: 'break-word',
            }}
          >
            {title}
          </div>
          {params.artist ? (
            <div
              style={{
                display: 'flex',
                fontSize: 36,
                opacity: 0.72,
                wordBreak: 'break-word',
              }}
            >
              {params.artist}
            </div>
          ) : null}
        </div>
        {params.artwork ? (
          <div
            style={{
              display: 'flex',
              width: 360,
              height: 360,
              flexShrink: 0,
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              borderRadius: getArtworkRadiusPx(360),
              border: `1px solid ${palette.swatches['surface-3'].dark.hex}`,
              background: palette.swatches['surface-1'].dark.hex,
            }}
          >
            <img
              src={params.artwork.dataUrl}
              alt={title}
              width={params.artwork.width}
              height={params.artwork.height}
              style={{ objectFit: 'contain' }}
            />
          </div>
        ) : null}
      </div>
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          left: 72,
          bottom: 72,
          fontSize: 28,
          opacity: 0.7,
        }}
      >
        {params.handle && params.slug
          ? `jov.ie/${params.handle}/${params.slug}`
          : 'jov.ie'}
      </div>
    </div>
  );
}
