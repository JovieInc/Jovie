import { unstable_cache } from 'next/cache';
import { notFound } from 'next/navigation';
import ArtistPage, {
  generateMetadata as generatePublicProfileMetadata,
} from '@/app/[username]/page';
import { createProfileTag } from '@/lib/cache/tags';
import {
  PROFILE_VARIANT_MARKER,
  parseProfileVariantKey,
} from '@/lib/profile/one-right-thing/variant';
import {
  isReservedUsername,
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
  USERNAME_PATTERN,
} from '@/lib/validation/username-core';

// Same one-hour ISR cadence as the canonical profile page.
export const revalidate = 3600;

interface ProfileVariantRenderPageProps {
  readonly params: Promise<{
    readonly username: string;
    readonly variant: string;
    readonly marker: string;
  }>;
}

/**
 * Private destination for the edge rewrites in
 * `lib/routing/profile-variant-rewrites.js`. The proxy rejects direct
 * requests that contain `__profile-variant`, so only rewritten requests reach
 * this page. It renders the canonical profile with the visitor's request
 * signals decoded from the variant key, so the first HTML already features
 * the right item.
 */
export default async function ProfileVariantRenderPage({
  params,
}: Readonly<ProfileVariantRenderPageProps>) {
  const { username, variant, marker } = await params;
  const seed =
    marker === PROFILE_VARIANT_MARKER ? parseProfileVariantKey(variant) : null;
  if (!seed) notFound();
  // Junk paths must 404 before they write anything to the data cache.
  if (
    username.length < USERNAME_MIN_LENGTH ||
    username.length > USERNAME_MAX_LENGTH ||
    !USERNAME_PATTERN.test(username) ||
    isReservedUsername(username)
  ) {
    notFound();
  }

  // Tag this variant's cache entry with the profile tag, so
  // revalidateTag(createProfileTag(username)) refreshes every variant even if
  // a data loader on the page is not tagged.
  await unstable_cache(async () => true, ['profile-variant-tag', username], {
    tags: [createProfileTag(username.toLowerCase())],
    revalidate: 3600,
  })();

  return ArtistPage({
    params: Promise.resolve({ username, __featuredSeed: seed }),
  });
}

// Metadata is the canonical profile's, unchanged: crawlers are served a
// variant by the rewrite and must still see an indexable, self-canonical page.
export async function generateMetadata({
  params,
}: Readonly<ProfileVariantRenderPageProps>) {
  const { username } = await params;
  return generatePublicProfileMetadata({
    params: Promise.resolve({ username }),
  });
}
