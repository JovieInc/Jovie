import type { Metadata } from 'next';

function httpsUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port) {
      return null;
    }
    return url.href;
  } catch {
    return null;
  }
}

/** Open Graph fields for an unclaimed Jovie link. Text stays text. */
export function jovieLinkMetadata(input: {
  readonly title: string | null;
  readonly artistName: string | null;
  readonly artworkUrl: string | null;
  readonly pageUrl: string;
}): Metadata {
  const title =
    [input.title, input.artistName].filter(Boolean).join(' — ') || 'Jovie';
  const description =
    input.title && input.artistName
      ? `Listen to ${input.title} by ${input.artistName}.`
      : 'Listen on your streaming service.';
  const image = httpsUrl(input.artworkUrl);
  return {
    title,
    description,
    robots: { index: false, follow: false },
    alternates: { canonical: input.pageUrl },
    openGraph: {
      title,
      description,
      url: input.pageUrl,
      ...(image ? { images: [{ url: image }] } : {}),
    },
    twitter: {
      card: image ? 'summary_large_image' : 'summary',
      title,
      description,
      ...(image ? { images: [image] } : {}),
    },
  };
}
