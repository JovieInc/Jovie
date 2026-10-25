import { BASE_URL } from '@/constants/app';
import type { PublicDiscogReleaseLite } from '@/lib/discography/queries';
import { buildSmartLinkUrl } from '@/lib/discography/utils';
import type { PublicMerchCard } from '@/lib/merch/types';
import { PROFILE_ROUTE_CONFIG } from '@/lib/profile/route-config';
import { cleanScrapedDisplayName } from '@/lib/profile/scraped-display-name';
import { toDateOnlySafe } from '@/lib/utils/date';
import { uuidSchema } from '@/lib/validation/schemas/base';

/** Use persisted slugs only. Never infer an item destination from its title. */
export function publicReleaseUrl(
  handle: string,
  slug: string | null
): string | null {
  if (
    !slug ||
    !slug.trim() ||
    /[/\\?#\p{Cc}]/u.test(slug) ||
    /^\.+$/.test(slug)
  )
    return null;
  try {
    const url = buildSmartLinkUrl(BASE_URL, handle, encodeURIComponent(slug));
    // Static profile routes win over [slug]; those are collection/action URLs.
    if (
      Object.values(PROFILE_ROUTE_CONFIG).some(
        route => `${BASE_URL}${route.buildPath(handle)}` === url
      )
    )
      return null;
    return url;
  } catch {
    return null;
  }
}

/** Projects only the fields already approved for public catalog discovery. */
export function publicReleases(
  handle: string,
  releases: readonly PublicDiscogReleaseLite[]
) {
  return releases.flatMap(release => {
    const url = publicReleaseUrl(handle, release.slug);
    return url
      ? [
          {
            id: release.id,
            title: release.title,
            type: release.releaseType,
            releaseDate: release.releaseDate
              ? toDateOnlySafe(release.releaseDate)
              : null,
            artworkUrl: release.artworkUrl ?? null,
            url,
          },
        ]
      : [];
  });
}

export function publicMerchUrl(handle: string, id: string): string | null {
  return uuidSchema.safeParse(id).success
    ? `${BASE_URL}/${handle}/merch/${encodeURIComponent(id)}`
    : null;
}

export function publicMerch(handle: string, cards: readonly PublicMerchCard[]) {
  return cards.flatMap(card => {
    const url = publicMerchUrl(handle, card.id);
    return url
      ? [
          {
            id: card.id,
            title: card.title,
            description: card.description,
            productType: card.productType,
            imageUrl: card.primaryImageUrl,
            retailPriceCents: card.retailPriceCents,
            url,
            available: true,
          },
        ]
      : [];
  });
}

/** Match the public-profile loader's treatment of unclaimed scraped names. */
export function publicCreatorName(profile: {
  readonly isClaimed: boolean | null;
  readonly displayName: string | null;
  readonly username: string;
}) {
  return (
    (profile.isClaimed
      ? profile.displayName
      : (cleanScrapedDisplayName(profile.displayName) ??
        profile.displayName)) || profile.username
  );
}
