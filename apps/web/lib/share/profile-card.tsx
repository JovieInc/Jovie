/* eslint @next/next/no-img-element: "off" -- ImageResponse requires standard img */
import palette from '@/design/oklch-palette.json';

export interface ProfileShareImage {
  readonly dataUrl: string;
  readonly width: number;
  readonly height: number;
}

/** Display-only composition; source imagery is never cropped, masked or overlaid. */
export function renderProfileShareCard(params: {
  readonly name: string;
  readonly handle?: string;
  readonly image?: ProfileShareImage | null;
}) {
  // Long names get the entire canvas before reducing type size. The native
  // metadata retains the complete name when a host omits or crops the bitmap.
  const image = params.name.length <= 32 ? params.image : null;
  const fontSize =
    params.name.length <= 24
      ? 80
      : params.name.length <= 40
        ? 72
        : params.name.length <= 64
          ? 64
          : 48;
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
            fontSize,
            lineHeight: 1.08,
            letterSpacing: '-0.025em',
            wordBreak: 'break-word',
          }}
        >
          {params.name}
        </div>
        {image ? (
          <div
            style={{
              display: 'flex',
              width: 360,
              height: 360,
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <img
              src={image.dataUrl}
              alt={params.name}
              width={image.width}
              height={image.height}
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
        {params.handle ? `jov.ie/${params.handle}` : 'jov.ie'}
      </div>
    </div>
  );
}
