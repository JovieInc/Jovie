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
import ContentSmartLinkPage, {
  generateMetadata as generateContentSmartLinkMetadata,
} from '@/app/[username]/[slug]/page';
import { sanitizeCacheTags } from '@/lib/cache/tags';
import { findRedirectByOldSlug } from '@/lib/discography/slug';
import { REDIRECT_SINK_METADATA } from '@/lib/profile/metadata';

const PROFILE_MODE_ALIAS_MARKER = '__profile-mode-alias';
const PROFILE_MODE_ALIAS_RESOLVER = 'resolve';

interface CatchAllPageProps {
  readonly params: Promise<{
    readonly username: string;
    readonly slug: string[];
  }>;
  readonly searchParams?: Promise<{
    readonly source?: string | string[];
  }>;
}

function getAliasSlug(slug: readonly string[]): string | null {
  if (
    slug.length !== 3 ||
    slug[1] !== PROFILE_MODE_ALIAS_MARKER ||
    slug[2] !== PROFILE_MODE_ALIAS_RESOLVER
  ) {
    return null;
  }
  const aliasSlug = slug[0];
  return aliasSlug && isLegacyProfileModeAlias(aliasSlug) ? aliasSlug : null;
}

async function getAliasCollisionState(
  creatorProfileId: string,
  aliasSlug: string
) {
  const load = () =>
    Promise.all([
      findRedirectByOldSlug(creatorProfileId, aliasSlug),
      getUnpublishedReleasePresence(creatorProfileId, aliasSlug),
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
  const aliasSlug = getAliasSlug(slug);
  if (aliasSlug) {
    return generateContentSmartLinkMetadata({
      params: Promise.resolve({ username, slug: aliasSlug }),
    });
  }
  return REDIRECT_SINK_METADATA;
}

export default async function CatchAllPage({
  params,
  searchParams,
}: Readonly<CatchAllPageProps>) {
  const { username, slug } = await params;
  const aliasSlug = getAliasSlug(slug);
  if (!aliasSlug) notFound();

  const creator = await getCreatorByUsername(username.toLowerCase());
  if (!creator) notFound();

  const content = await getContentBySlug(creator.id, aliasSlug);
  if (!content) {
    // Both collision checks are read-only and independent. Starting them
    // together preserves the precedence below while removing one full remote
    // database round trip from every warmed legacy deep link (JOV-4788).
    const [oldSlugRedirect, unpublished] = await getAliasCollisionState(
      creator.id,
      aliasSlug
    );
    if (oldSlugRedirect) {
      permanentRedirect(
        `/${creator.usernameNormalized}/${oldSlugRedirect.currentSlug}`
      );
    }

    if (!unpublished) {
      const legacyModeHref = getLegacyProfileModeRedirectHref(
        creator.usernameNormalized,
        aliasSlug,
        await searchParams
      );
      if (legacyModeHref) redirect(legacyModeHref);
      notFound();
    }
  }

  // Published and unpublished collisions keep the original public URL and use
  // the canonical smart-link renderer. Data helpers are request-memoized, so
  // this delegation does not turn the collision check into duplicate DB work.
  return (
    <ContentSmartLinkPage
      params={Promise.resolve({
        username: creator.usernameNormalized,
        slug: aliasSlug,
      })}
    />
  );
}
