import 'server-only';

import { and, eq, inArray } from 'drizzle-orm';
import { invalidateReleaseCaches } from '@/lib/cache/releases';
import { db } from '@/lib/db';
import { discogReleases, providers } from '@/lib/db/schema/content';
import { upsertProviderLink, upsertRelease } from '@/lib/discography/queries';
import { slugify } from '@/lib/utils';
import type { AgentDraftRow } from './draft-store';

/**
 * Agent-supplied artwork renders and persists only from DSP image CDNs. This
 * is deliberately narrower than the general CSP/avatar host list, which also
 * admits user-upload hosts (storage buckets, Discord, QR generators). Every
 * entry here is also in PLATFORM_CDN_DOMAINS, so Next/Image and CSP allow it.
 */
export const AGENT_DRAFT_ARTWORK_HOSTS = [
  'i.scdn.co',
  '*.spotifycdn.com',
  '*.mzstatic.com',
  '*.dzcdn.net',
  '*.sndcdn.com',
  '*.tidal.com',
  '*.ytimg.com',
  '*.bcbits.com',
] as const;

function isAgentArtworkHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return AGENT_DRAFT_ARTWORK_HOSTS.some(pattern =>
    pattern.startsWith('*.')
      ? host.endsWith(pattern.slice(1)) && host.length > pattern.length - 1
      : host === pattern
  );
}

export function trustedImageUrl(value: string | null | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !url.port &&
      isAgentArtworkHost(url.hostname)
      ? url.href
      : null;
  } catch {
    return null;
  }
}

/**
 * Release page + smart link (as an unpublished draft) from the draft's
 * prepared launch. Runs after the claim commits; a revisit by the owner
 * retries it, and an existing release with the same slug is never touched.
 * Agent-supplied links are kept only for providers Jovie knows, and artwork
 * only from provider image CDNs.
 */
export async function materializeAgentDraftRelease(
  row: AgentDraftRow,
  profileId: string,
  userId: string
): Promise<void> {
  const result = row.preview.launch?.result;
  const title = result?.release.title;
  if (!result || !title) return;
  const slug = slugify(title);
  if (!slug) return;
  // Never overwrite a release the owner already has (or has since edited).
  const [existingRelease] = await db
    .select({ id: discogReleases.id })
    .from(discogReleases)
    .where(
      and(
        eq(discogReleases.creatorProfileId, profileId),
        eq(discogReleases.slug, slug)
      )
    )
    .limit(1);
  if (existingRelease) return;
  const release = await upsertRelease({
    creatorProfileId: profileId,
    title,
    slug,
    releaseType: result.release.content_type === 'album' ? 'album' : 'single',
    releaseDate: result.release.release_date
      ? new Date(result.release.release_date)
      : null,
    upc: result.release.upc,
    artworkUrl: trustedImageUrl(result.release.artwork_url),
    sourceType: 'manual',
    status: 'draft',
    metadata: { agentDraftId: row.id },
  });
  const linkEntries = Object.entries(result.smart_link.links);
  if (linkEntries.length > 0) {
    const known = new Set(
      (
        await db
          .select({ id: providers.id })
          .from(providers)
          .where(
            inArray(
              providers.id,
              linkEntries.map(([provider]) => provider)
            )
          )
      ).map(provider => provider.id)
    );
    for (const [providerId, url] of linkEntries) {
      if (!known.has(providerId)) continue;
      await upsertProviderLink({
        releaseId: release.id,
        providerId,
        url,
        sourceType: 'manual',
      });
    }
  }
  invalidateReleaseCaches(userId, profileId);
}
