import { serverFetch } from '@/lib/http/server-fetch';
import type {
  CanonicalSubmissionContext,
  DiscoveredTarget,
  ProviderSnapshot,
} from '../../types';

function extractMetaContent(html: string, key: string): string | null {
  const match = new RegExp(
    `<meta[^>]+(?:property|name)=["']${key}["'][^>]+content=["']([^"']+)["'][^>]*>`,
    'i'
  ).exec(html);
  return match?.[1]?.trim() ?? null;
}

export async function snapshotAmazonTarget(
  _canonical: CanonicalSubmissionContext,
  target: DiscoveredTarget
): Promise<ProviderSnapshot | null> {
  const response = await serverFetch(target.canonicalUrl, {
    context: `Amazon target fetch (${target.targetType})`,
    timeoutMs: 8_000,
    retry: { maxRetries: 2, baseDelayMs: 250, maxDelayMs: 1000 },
  });

  if (!response.ok) {
    return null;
  }

  const html = await response.text();
  const description =
    extractMetaContent(html, 'description') ??
    extractMetaContent(html, 'og:description');
  const image =
    extractMetaContent(html, 'og:image') ??
    extractMetaContent(html, 'twitter:image');

  return {
    targetType: target.targetType,
    canonicalUrl: target.canonicalUrl,
    normalizedData: {
      hasBio: Boolean(description),
      hasArtistImage: Boolean(image),
      hasArtwork: Boolean(image),
    },
  };
}
