/* eslint @next/next/no-img-element: "off" -- ImageResponse requires standard img */
import { getArtworkRadiusPx } from '@/components/atoms/ArtworkFrame';
import palette from '@/design/oklch-palette.json';

/** Display-only composition; source imagery is never cropped, masked or overlaid. */
export function renderReleaseShareCard(params: {
  readonly title: string;
  readonly artistName: string;
  readonly urlText: string;
  /** Artwork as a satori-decodable data URL (see `toDataUrl`), null renders a quiet placeholder tile. */
  readonly image?: string | null;
}) {
  // Long titles keep the full column before reducing type size. The page
  // metadata retains the complete title when a host omits or crops the bitmap.
  const fontSize =
    params.title.length <= 24 ? 68 : params.title.length <= 48 ? 58 : 48;
  return (
    <div
      style={{
        display: 'flex',
        position: 'relative',
        width: '100%',
        height: '100%',
        padding: 56,
        gap: 56,
        background: palette.swatches.canvas.dark.hex,
        color: palette.swatches['text-primary'].dark.hex,
        fontFamily: 'Satoshi',
        fontWeight: 700,
      }}
    >
      {params.image ? (
        <div
          style={{
            display: 'flex',
            width: 518,
            height: 518,
            flexShrink: 0,
            overflow: 'hidden',
            borderRadius: getArtworkRadiusPx(518),
          }}
        >
          <img
            src={params.image}
            alt={params.title}
            width={518}
            height={518}
            style={{ objectFit: 'cover' }}
          />
        </div>
      ) : (
        <div
          style={{
            display: 'flex',
            width: 518,
            height: 518,
            flexShrink: 0,
            borderRadius: getArtworkRadiusPx(518),
            background: palette.swatches['surface-1'].dark.hex,
          }}
        />
      )}
      <div
        style={{
          display: 'flex',
          position: 'relative',
          flex: 1,
          minWidth: 0,
          flexDirection: 'column',
          justifyContent: 'center',
          gap: 24,
        }}
      >
        <div
          style={{
            display: 'flex',
            fontSize,
            lineHeight: 1.08,
            letterSpacing: '-0.025em',
            wordBreak: 'break-word',
          }}
        >
          {params.title}
        </div>
        {params.artistName ? (
          <div
            style={{
              display: 'flex',
              fontSize: 30,
              letterSpacing: '-0.01em',
              opacity: 0.7,
            }}
          >
            {`by ${params.artistName}`}
          </div>
        ) : null}
        <div
          style={{
            display: 'flex',
            position: 'absolute',
            left: 0,
            bottom: 0,
            fontSize: 26,
            letterSpacing: '-0.01em',
            opacity: 0.7,
          }}
        >
          {params.urlText}
        </div>
      </div>
    </div>
  );
}
