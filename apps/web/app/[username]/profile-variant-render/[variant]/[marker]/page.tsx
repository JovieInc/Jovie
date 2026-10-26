import { notFound } from 'next/navigation';
import ArtistPage, {
  generateMetadata as generatePublicProfileMetadata,
} from '@/app/[username]/page';
import {
  PROFILE_VARIANT_MARKER,
  parseProfileVariantKey,
} from '@/lib/profile/one-right-thing/variant';

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
