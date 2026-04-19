import { THEME } from './image-utils';
import { StoryLayout } from './story-layout';

function clampText(input: string, maxLength: number): string {
  return input.length > maxLength
    ? `${input.slice(0, maxLength - 1).trimEnd()}…`
    : input;
}

function Headline({
  children,
  fontSize = 68,
}: {
  readonly children: React.ReactNode;
  readonly fontSize?: number;
}) {
  return (
    <div
      style={{
        display: 'flex',
        fontSize,
        fontWeight: 650,
        lineHeight: 1.08,
        letterSpacing: '-0.03em',
        color: THEME.text,
        textAlign: 'center',
        fontFamily: '"Source Serif 4", serif',
      }}
    >
      {children}
    </div>
  );
}

function BodyCopy({
  children,
  maxWidth = 840,
}: {
  readonly children: React.ReactNode;
  readonly maxWidth?: number;
}) {
  return (
    <div
      style={{
        display: 'flex',
        maxWidth,
        fontSize: 28,
        lineHeight: 1.45,
        letterSpacing: '-0.01em',
        color: THEME.textMuted,
        textAlign: 'center',
        fontFamily: '"Source Serif 4", serif',
      }}
    >
      {children}
    </div>
  );
}

function StoryImage({
  src,
  alt,
  size,
  rounded = 36,
}: {
  readonly src: string;
  readonly alt: string;
  readonly size: number;
  readonly rounded?: number;
}) {
  return (
    <div
      style={{
        display: 'flex',
        width: size,
        height: size,
        overflow: 'hidden',
        borderRadius: rounded,
        border: `1px solid ${THEME.border}`,
        background: '#111111',
        boxShadow: '0 24px 80px rgba(0, 0, 0, 0.28)',
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- ImageResponse requires standard img */}
      <img
        src={src}
        alt={alt}
        width={size}
        height={size}
        style={{ objectFit: 'cover' }}
      />
    </div>
  );
}

export function renderBlogStoryCard(params: {
  readonly title: string;
  readonly excerpt?: string;
  readonly urlText: string;
}) {
  return (
    <StoryLayout
      eyebrowText='From the Jovie blog'
      ctaText='Read More'
      urlText={params.urlText}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 32,
          maxWidth: 920,
        }}
      >
        <Headline fontSize={clampText(params.title, 96).length > 72 ? 58 : 68}>
          {clampText(params.title, 96)}
        </Headline>
        {params.excerpt ? (
          <BodyCopy>{clampText(params.excerpt, 180)}</BodyCopy>
        ) : null}
      </div>
    </StoryLayout>
  );
}

export function renderProfileStoryCard(params: {
  readonly artistName: string;
  readonly avatarDataUrl: string | null;
  readonly bio?: string | null;
  readonly urlText: string;
}) {
  return (
    <StoryLayout
      eyebrowText='Share This Profile'
      ctaText='Open Profile'
      urlText={params.urlText}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 36,
          maxWidth: 900,
        }}
      >
        {params.avatarDataUrl ? (
          <StoryImage
            src={params.avatarDataUrl}
            alt={params.artistName}
            size={420}
            rounded={210}
          />
        ) : null}
        <Headline fontSize={78}>{clampText(params.artistName, 44)}</Headline>
        {params.bio ? <BodyCopy>{clampText(params.bio, 150)}</BodyCopy> : null}
      </div>
    </StoryLayout>
  );
}

export function renderReleaseStoryCard(params: {
  readonly title: string;
  readonly artistName: string;
  readonly artworkDataUrl: string | null;
  readonly urlText: string;
}) {
  return (
    <StoryLayout
      eyebrowText='Listen On Jovie'
      ctaText='Listen Now'
      urlText={params.urlText}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 28,
          maxWidth: 900,
        }}
      >
        {params.artworkDataUrl ? (
          <StoryImage
            src={params.artworkDataUrl}
            alt={params.title}
            size={520}
          />
        ) : null}
        <Headline fontSize={66}>{clampText(params.title, 80)}</Headline>
        <BodyCopy maxWidth={760}>
          {clampText(`by ${params.artistName}`, 80)}
        </BodyCopy>
      </div>
    </StoryLayout>
  );
}

export function renderPlaylistStoryCard(params: {
  readonly title: string;
  readonly note?: string | null;
  readonly artworkDataUrl: string | null;
  readonly urlText: string;
}) {
  return (
    <StoryLayout
      eyebrowText='Curated On Jovie'
      ctaText='Open Playlist'
      urlText={params.urlText}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 28,
          maxWidth: 900,
        }}
      >
        {params.artworkDataUrl ? (
          <StoryImage
            src={params.artworkDataUrl}
            alt={params.title}
            size={520}
          />
        ) : null}
        <Headline fontSize={64}>{clampText(params.title, 72)}</Headline>
        {params.note ? (
          <BodyCopy>{clampText(params.note, 140)}</BodyCopy>
        ) : null}
      </div>
    </StoryLayout>
  );
}
