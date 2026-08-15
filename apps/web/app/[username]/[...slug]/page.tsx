import type { Metadata } from 'next';
import { unstable_cache } from 'next/cache';
import { notFound, permanentRedirect, redirect } from 'next/navigation';
import {
  getLegacyProfileModeRedirectHref,
  isLegacyProfileModeAlias,
} from '@/app/[username]/_lib/mode-route-redirect';
import { shouldBypassPublicProfileQaCache } from '@/app/[username]/_lib/public-profile-qa';
import {
  getContentBySlug,
  getCreatorByUsername,
  getUnpublishedReleasePresence,
} from '@/app/[username]/[slug]/_lib/data';
import { sanitizeCacheTags } from '@/lib/cache/tags';
import { findRedirectByOldSlug } from '@/lib/discography/slug';
import { REDIRECT_SINK_METADATA } from '@/lib/profile/metadata';
import { hasProfileModeAliasContentCandidate } from './_lib/content-candidate';

const PROFILE_MODE_ALIAS_MARKER = '__profile-mode-alias';
const PROFILE_MODE_ALIAS_RESOLVER = 'resolve';
const PROFILE_MODE_ALIAS_CACHEABLE_SOURCES = new Set(['link', 'qr']);

// This resolver contains no request-bound Dynamic API. Keeping the supported
// attribution value in the private rewrite path lets Next cache the collision
// decision and redirect at the edge while refreshing it on the same five-minute
// cadence as the underlying collision data.
export const revalidate = 300;

// Keep the database-adjacent home region while also serving the cached alias
// resolver from the West Coast ingress observed by the production budget gate.
// Collision misses still fail closed through the unchanged resolver below.
export const preferredRegion = ['iad1', 'sfo1'];

// Opt unknown catch-all params into on-demand ISR. Returning an empty set is
// intentional: real handles/slugs are discovered at request time, then the
// resulting redirect, smart-link, or 404 is refreshed by `revalidate` above.
export function generateStaticParams() {
  return [];
}

interface CatchAllPageProps {
  readonly params: Promise<{
    readonly username: string;
    readonly slug: string[];
  }>;
}

interface ProfileModeAliasRequest {
  readonly aliasSlug: string;
  readonly source?: string;
}

function getAliasRequest(
  slug: readonly string[]
): ProfileModeAliasRequest | null {
  if (
    (slug.length !== 3 && slug.length !== 4) ||
    slug[1] !== PROFILE_MODE_ALIAS_MARKER ||
    slug[2] !== PROFILE_MODE_ALIAS_RESOLVER
  ) {
    return null;
  }
  const aliasSlug = slug[0];
  if (!aliasSlug || !isLegacyProfileModeAlias(aliasSlug)) return null;

  const source = slug[3]?.trim();
  return source && PROFILE_MODE_ALIAS_CACHEABLE_SOURCES.has(source)
    ? { aliasSlug, source }
    : { aliasSlug };
}

async function getAliasCollisionState(
  creatorProfileId: string,
  aliasSlug: string
) {
  const load = () =>
    Promise.all([
      findRedirectByOldSlug(creatorProfileId, aliasSlug, {
        onError: 'throw',
      }),
      getUnpublishedReleasePresence(creatorProfileId, aliasSlug, {
        onError: 'throw',
      }),
    ]);

  if (
    process.env.NODE_ENV === 'test' ||
    process.env.NODE_ENV === 'development' ||
    shouldBypassPublicProfileQaCache()
  ) {
    return load();
  }

  return unstable_cache(
    load,
    [`profile-mode-alias-collision-${creatorProfileId}-${aliasSlug}`],
    {
      tags: sanitizeCacheTags([
        'smartlink-content',
        `smartlink-content:${creatorProfileId}`,
        `smartlink-content:${creatorProfileId}:${aliasSlug}`,
      ]),
      revalidate: 300,
    }
  )();
}

// Catch-all for unknown sub-paths — returns a context-aware 404.
// Marked noindex to avoid indexing transient or unknown paths.
export async function generateMetadata({
  params,
}: CatchAllPageProps): Promise<Metadata> {
  const { username, slug } = await params;
  const aliasRequest = getAliasRequest(slug);
  if (aliasRequest) {
    const creator = await getCreatorByUsername(username.toLowerCase());
    if (!creator) return REDIRECT_SINK_METADATA;

    const hasContentCandidate = await hasProfileModeAliasContentCandidate(
      creator.id,
      aliasRequest.aliasSlug
    );
    if (!hasContentCandidate) return REDIRECT_SINK_METADATA;

    const { generateMetadata: generateContentSmartLinkMetadata } = await import(
      '@/app/[username]/[slug]/page'
    );
    return generateContentSmartLinkMetadata({
      params: Promise.resolve({ username, slug: aliasRequest.aliasSlug }),
    });
  }
  return REDIRECT_SINK_METADATA;
}

export default async function CatchAllPage({
  params,
}: Readonly<CatchAllPageProps>) {
  const { username, slug } = await params;
  const aliasRequest = getAliasRequest(slug);
  if (!aliasRequest) notFound();

  const creator = await getCreatorByUsername(username.toLowerCase());
  if (!creator) notFound();

  // Start independent collision and candidate checks together. The common
  // profile-mode alias path performs bounded ID-only checks in parallel;
  // any possible content still delegates to the canonical smart-link loader.
  const collisionStatePromise = getAliasCollisionState(
    creator.id,
    aliasRequest.aliasSlug
  ).then(
    value => ({ ok: true as const, value }),
    error => ({ error, ok: false as const })
  );
  const hasContentCandidate = await hasProfileModeAliasContentCandidate(
    creator.id,
    aliasRequest.aliasSlug
  );
  const content = hasContentCandidate
    ? await getContentBySlug(creator.id, aliasRequest.aliasSlug)
    : null;
  if (!content) {
    const collisionState = await collisionStatePromise;
    if (!collisionState.ok) throw collisionState.error;
    const [oldSlugRedirect, unpublished] = collisionState.value;
    if (oldSlugRedirect) {
      permanentRedirect(
        `/${creator.usernameNormalized}/${oldSlugRedirect.currentSlug}`
      );
    }

    if (!unpublished) {
      const legacyModeHref = getLegacyProfileModeRedirectHref(
        creator.usernameNormalized,
        aliasRequest.aliasSlug,
        aliasRequest.source ? { source: aliasRequest.source } : undefined
      );
      if (legacyModeHref) redirect(legacyModeHref);
      notFound();
    }
  }

  // Published and unpublished collisions keep the original public URL and use
  // the canonical smart-link renderer. Data helpers are request-memoized, so
  // this delegation does not turn the collision check into duplicate DB work.
  const { default: ContentSmartLinkPage } = await import(
    '@/app/[username]/[slug]/page'
  );
  return (
    <ContentSmartLinkPage
      params={Promise.resolve({
        username: creator.usernameNormalized,
        slug: aliasRequest.aliasSlug,
      })}
    />
  );
}
