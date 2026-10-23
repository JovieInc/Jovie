import type { Metadata } from 'next';
import { notFound, permanentRedirect, redirect } from 'next/navigation';
import { isLegacyProfileModeAlias } from '@/app/[username]/_lib/mode-route-redirect';
import { resolveProfileModeAliasDecision } from '@/app/[username]/_lib/profile-mode-alias-resolution';
import { getCreatorByUsername } from '@/app/[username]/[slug]/_lib/data';
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

  // The shared decision owns the full collision/redirect order and is also
  // used by the edge decision endpoint, so the page and the fast path can
  // never disagree about which outcome an alias resolves to.
  const decision = await resolveProfileModeAliasDecision(
    username,
    aliasRequest.aliasSlug,
    aliasRequest.source
  );

  if (decision.kind === 'moved' && decision.href) {
    permanentRedirect(decision.href);
  }
  if (decision.kind === 'mode' && decision.href) {
    redirect(decision.href);
  }
  if (decision.kind === 'missing' || !decision.creatorUsername) {
    notFound();
  }

  // Published and unpublished collisions keep the original public URL and use
  // the canonical smart-link renderer.
  const { default: ContentSmartLinkPage } = await import(
    '@/app/[username]/[slug]/page'
  );
  return (
    <ContentSmartLinkPage
      params={Promise.resolve({
        username: decision.creatorUsername,
        slug: aliasRequest.aliasSlug,
      })}
    />
  );
}
