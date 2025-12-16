import type { LegacySocialLink } from '@/types/db';

type ProfileNextAction =
  | {
      kind: 'listen';
    }
  | {
      kind: 'tickets';
      url: string;
    }
  | {
      kind: 'spotify';
      url: string;
    }
  | {
      kind: 'shop';
      url: string;
    };

function findFirstMatchingUrl(params: {
  links: LegacySocialLink[];
  match: (platformLower: string) => boolean;
}): string | null {
  const candidate = params.links.find(link =>
    params.match(link.platform.toLowerCase())
  );
  return candidate?.url ?? null;
}

function findTicketsUrl(links: LegacySocialLink[]): string | null {
  return findFirstMatchingUrl({
    links,
    match: platform =>
      platform.includes('bandsintown') ||
      platform.includes('songkick') ||
      platform.includes('ticketmaster') ||
      platform.includes('seatgeek') ||
      platform.includes('tickets') ||
      platform.includes('tour'),
  });
}

function findShopUrl(links: LegacySocialLink[]): string | null {
  return findFirstMatchingUrl({
    links,
    match: platform =>
      platform.includes('bandcamp') ||
      platform.includes('shop') ||
      platform.includes('merch'),
  });
}

function findSpotifyUrl(links: LegacySocialLink[]): string | null {
  return findFirstMatchingUrl({
    links,
    match: platform => platform === 'spotify',
  });
}

export function resolveProfileNextAction(params: {
  socialLinks: LegacySocialLink[];
  spotifyPreferred: boolean;
}): ProfileNextAction {
  const ticketsUrl = findTicketsUrl(params.socialLinks);
  if (ticketsUrl) return { kind: 'tickets', url: ticketsUrl };

  const shopUrl = findShopUrl(params.socialLinks);
  if (shopUrl) return { kind: 'shop', url: shopUrl };

  const spotifyUrl = params.spotifyPreferred
    ? findSpotifyUrl(params.socialLinks)
    : null;
  if (spotifyUrl) return { kind: 'spotify', url: spotifyUrl };

  return { kind: 'listen' };
}

export type { ProfileNextAction };
