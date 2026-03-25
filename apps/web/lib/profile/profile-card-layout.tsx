/**
 * Shared layout for profile card images (OG images + celebration cards).
 *
 * Uses Satori-compatible JSX (inline styles, no Tailwind).
 * Imported by opengraph-image.tsx and the celebration-card API route.
 */

export interface ProfileCardData {
  artistName: string;
  username: string;
  avatarUrl: string | null;
  genreTags: string[];
  releaseCount?: number;
  releaseSubtitle?: string;
  isPublic: boolean;
}

export interface ProfileCardSize {
  width: number;
  height: number;
}

/** Truncate a string with an ellipsis if it exceeds maxLength. */
export function truncateText(input: string, maxLength: number): string {
  if (input.length <= maxLength) return input;
  return `${input.slice(0, maxLength - 1)}…`;
}

const GRADIENT =
  'radial-gradient(circle at 15% 10%, #363062 0%, #17122d 40%, #0a0715 100%)';

/**
 * Returns Satori-compatible JSX for a branded profile card.
 *
 * Adapts layout based on the given size:
 *  - OG (1200x630): horizontal layout with release stats
 *  - Feed (1080x1080): centered square layout
 *  - Story (1080x1920): centered tall layout with more spacing
 */
function resolveLayoutMetrics(size: ProfileCardSize) {
  const isSquareOrTall = size.width === size.height || size.height > size.width;
  return {
    isSquareOrTall,
    avatarSize: isSquareOrTall ? 220 : 164,
    nameFontSize: isSquareOrTall ? 72 : 60,
    tagFontSize: isSquareOrTall ? 24 : 20,
    align: (isSquareOrTall ? 'center' : 'flex-start') as
      | 'center'
      | 'flex-start',
    padding: isSquareOrTall ? 64 : 48,
    maxTextWidth: isSquareOrTall ? 900 : 820,
  };
}

export function profileCardLayout(
  data: ProfileCardData,
  size: ProfileCardSize
) {
  const { artistName, username, avatarUrl, genreTags, isPublic } = data;
  const layout = resolveLayoutMetrics(size);
  const { avatarSize, nameFontSize, tagFontSize } = layout;

  const tags = genreTags.length > 0 ? genreTags : ['Artist profile'];

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: layout.align,
        justifyContent: 'center',
        position: 'relative',
        background: GRADIENT,
        color: '#ffffff',
        fontFamily: 'Inter',
        padding: layout.padding,
      }}
    >
      {/* Jovie wordmark */}
      <div
        style={{
          position: 'absolute',
          top: 30,
          right: 40,
          display: 'flex',
          fontSize: 30,
          fontWeight: 600,
          letterSpacing: -0.5,
          color: '#b6a8ff',
        }}
      >
        Jovie
      </div>

      {/* Card surface */}
      <div
        style={{
          display: 'flex',
          flexDirection: layout.isSquareOrTall ? 'column' : 'row',
          alignItems: 'center',
          gap: layout.isSquareOrTall ? 32 : 28,
          width: '100%',
          borderRadius: 28,
          border: '1px solid rgba(255,255,255,0.14)',
          background: 'rgba(8, 8, 18, 0.44)',
          padding: layout.isSquareOrTall ? 48 : 36,
          textAlign: layout.isSquareOrTall ? 'center' : 'left',
        }}
      >
        {/* Avatar */}
        <div
          style={{
            width: avatarSize,
            height: avatarSize,
            borderRadius: 24,
            border: '2px solid rgba(255,255,255,0.2)',
            background: 'rgba(255,255,255,0.08)',
            overflow: 'hidden',
            display: 'flex',
            flexShrink: 0,
          }}
        >
          {isPublic && avatarUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element -- Satori requires standard img */
            <img
              src={avatarUrl}
              alt={`${artistName} avatar`}
              width={avatarSize}
              height={avatarSize}
              style={{ objectFit: 'cover' }}
            />
          ) : (
            <div
              style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: Math.round(avatarSize * 0.35),
                fontWeight: 700,
                color: '#d9d4ff',
              }}
            >
              {artistName.charAt(0).toUpperCase()}
            </div>
          )}
        </div>

        {/* Text content */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
            alignItems: layout.align,
          }}
        >
          <div
            style={{
              display: 'flex',
              fontSize: nameFontSize,
              fontWeight: 700,
              lineHeight: 1.05,
              letterSpacing: -1.4,
              maxWidth: layout.maxTextWidth,
            }}
          >
            {truncateText(artistName, 32)}
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: 28,
              color: '#d4cffb',
              maxWidth: layout.maxTextWidth,
            }}
          >
            {isPublic ? `@${username}` : 'Artist profile preview'}
          </div>
        </div>
      </div>

      {/* Genre tags */}
      <div
        style={{
          display: 'flex',
          gap: 12,
          flexWrap: 'wrap',
          justifyContent: layout.align,
          marginTop: 24,
        }}
      >
        {tags.map(tag => (
          <div
            key={tag}
            style={{
              display: 'flex',
              padding: '8px 14px',
              borderRadius: 999,
              fontSize: tagFontSize,
              fontWeight: 500,
              color: '#e7e1ff',
              background: 'rgba(182, 168, 255, 0.18)',
              border: '1px solid rgba(182, 168, 255, 0.35)',
            }}
          >
            {truncateText(tag, 18)}
          </div>
        ))}
      </div>

      {/* Profile URL footer */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: layout.isSquareOrTall ? 'center' : 'flex-end',
          position: 'absolute',
          bottom: 30,
          right: layout.isSquareOrTall ? undefined : 40,
          fontSize: 20,
          color: '#c7bfff',
        }}
      >
        <span>jov.ie/{username}</span>
        <span style={{ color: '#9f95d9' }}>Artist growth, simplified</span>
      </div>
    </div>
  );
}
