import type { Metadata } from 'next';
import { PROFILE_VIEW_REGISTRY, type ProfileViewKey } from './registry';

/**
 * Inputs needed to build per-mode Next.js metadata. Scoped to what the
 * registry actually consumes so callers don't have to hand in an entire
 * view model.
 */
export interface ProfileViewMetadataInput {
  readonly artistName: string;
  readonly artistHandle: string;
  readonly baseUrl: string;
}

/**
 * Build a `Metadata` object for a given profile view. Used by the routed
 * mode pages (plan PR 3a) so each of `/[username]/listen`, `/subscribe`,
 * `/pay`, `/contact`, `/about`, `/tour`, `/releases`, `/share`, `/menu` gets
 * a self-canonical URL and a title/description pulled from
 * `PROFILE_VIEW_REGISTRY`. Keeps `generateMetadata` in every route file
 * down to a one-liner.
 */
export function buildViewMetadata(
  key: ProfileViewKey,
  input: ProfileViewMetadataInput
): Metadata {
  const entry = PROFILE_VIEW_REGISTRY[key];
  const pathSegment = key === 'profile' ? '' : `/${key}`;
  const canonical = `${input.baseUrl.replace(/\/$/, '')}/${input.artistHandle}${pathSegment}`;

  // Titles read as "{Mode} · {Artist} · Jovie" so the mode is the scan
  // target when the URL surfaces in a browser tab or share preview.
  const title =
    key === 'profile'
      ? `${input.artistName} · Jovie`
      : `${entry.title} · ${input.artistName} · Jovie`;

  const description = entry.subtitle ?? `${input.artistName} on Jovie.`;

  return {
    title,
    description,
    alternates: {
      canonical,
    },
    openGraph: {
      type: 'profile',
      title,
      description,
      url: canonical,
      siteName: 'Jovie',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
  };
}
