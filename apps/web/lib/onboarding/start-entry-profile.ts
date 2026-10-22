import { APP_ROUTES } from '@/constants/routes';
import { cleanScrapedDisplayName } from '@/lib/profile/scraped-display-name';
import {
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
  USERNAME_PATTERN,
} from '@/lib/validation/username-core';
import { resolveClaimNameEntry } from './claim-name-entry';

const MAX_ENTRY_LINKS = 8;

/** Public catalog projection, selected by the existing profile service. */
export interface StartEntryRelease {
  readonly title: string;
  readonly slug: string;
  readonly artworkUrl: string | null;
  readonly releaseDate: Date | string | null;
  readonly revealDate?: Date | string | null;
  readonly releaseType: string;
}

/**
 * What `/start?handle=<handle>` knows about the visitor before they type
 * (JOV-7753). Outreach and claim links carry the handle; the first screen
 * shows the real page behind it instead of a blank prompt.
 */
export type StartEntryProfile =
  | {
      readonly status: 'claimable';
      /** Routing context only; never an ownership or availability receipt. */
      readonly profileId?: string;
      readonly handle: string;
      readonly displayName: string;
      readonly avatarUrl: string | null;
      readonly spotifyId: string | null;
      readonly spotifyUrl: string | null;
      readonly spotifyFollowers?: number | null;
      readonly latestRelease?: StartEntryRelease | null;
      readonly genres: readonly string[];
      readonly socialLinks: readonly string[];
      /** Distinct platforms behind those links, for the entry card icon row. */
      readonly linkPlatforms: readonly string[];
      readonly linkCount: number;
    }
  | {
      readonly status: 'claimed';
      readonly profileId?: string;
      readonly handle: string;
      readonly displayName: string;
      readonly avatarUrl: string | null;
    }
  | {
      readonly status: 'available';
      readonly handle: string;
      /** Visitor-entered draft text; never verified catalog identity. */
      readonly displayName?: string;
    };

export interface StartEntryProfileSource {
  readonly id?: string;
  readonly usernameNormalized: string;
  readonly displayName: string | null;
  readonly avatarUrl: string | null;
  readonly isPublic: boolean | null;
  readonly isClaimed: boolean | null;
  readonly spotifyId: string | null;
  readonly spotifyUrl: string | null;
  readonly spotifyFollowers?: number | null;
  readonly latestRelease?: StartEntryRelease | null;
  readonly genres: readonly string[] | null;
  readonly socialLinks: readonly {
    readonly url: string;
    readonly platform: string;
  }[];
}

/** Returns the normalized handle from `?handle=`, or null when it is not a valid handle. */
export function readStartEntryHandle(
  params: Readonly<Record<string, string | string[] | undefined>>
): string | null {
  const raw =
    typeof params.handle === 'string' && params.handle.trim()
      ? params.handle
      : typeof params.entry === 'string'
        ? resolveClaimNameEntry(params.entry).handle
        : params.handle;
  if (typeof raw !== 'string') return null;
  const handle = raw.trim().replace(/^@/, '').toLowerCase();
  if (
    handle.length < USERNAME_MIN_LENGTH ||
    handle.length > USERNAME_MAX_LENGTH ||
    !USERNAME_PATTERN.test(handle)
  ) {
    return null;
  }
  return handle;
}

/** Retain the visitor's name only for a new draft, never override a real page. */
export function withStartEntryDisplayName(
  entry: StartEntryProfile | null,
  params: Readonly<Record<string, string | string[] | undefined>>
): StartEntryProfile | null {
  if (entry?.status !== 'available') return entry;
  const raw = params.display_name ?? params.entry;
  const name =
    typeof raw === 'string' ? resolveClaimNameEntry(raw).displayName : null;
  return name ? { ...entry, displayName: name } : entry;
}

export function buildStartEntryResumeHref(
  entry?: StartEntryProfile | null
): string {
  if (!entry) return `${APP_ROUTES.START}?resume=1`;
  const params = new URLSearchParams({ handle: entry.handle });
  if (entry.status === 'available' && entry.displayName)
    params.set('display_name', entry.displayName);
  return `${APP_ROUTES.START}?${params.toString()}`;
}

function httpsLinks(links: StartEntryProfileSource['socialLinks']) {
  const urls: string[] = [];
  const platforms = new Set<string>();
  for (const link of links) {
    try {
      const parsed = new URL(link.url);
      if (parsed.protocol === 'https:' && !urls.includes(parsed.toString())) {
        urls.push(parsed.toString());
        platforms.add(link.platform.toLowerCase());
      }
    } catch {
      // Skip malformed stored links rather than failing the entry screen.
    }
    if (urls.length >= MAX_ENTRY_LINKS) break;
  }
  return { urls, platforms: [...platforms] };
}

/**
 * Map a looked-up profile (or its absence) to the entry state. Private
 * profiles are treated as unknown so /start never reveals them.
 */
export function buildStartEntryProfile(
  handle: string,
  profile: StartEntryProfileSource | null
): StartEntryProfile | null {
  if (!profile) return { status: 'available', handle };
  if (!profile.isPublic) return null;

  const displayName =
    cleanScrapedDisplayName(profile.displayName) ?? profile.usernameNormalized;

  if (profile.isClaimed) {
    return {
      status: 'claimed',
      ...(profile.id ? { profileId: profile.id } : {}),
      handle: profile.usernameNormalized,
      displayName,
      avatarUrl: profile.avatarUrl,
    };
  }

  const links = httpsLinks(profile.socialLinks);
  return {
    status: 'claimable',
    ...(profile.id ? { profileId: profile.id } : {}),
    handle: profile.usernameNormalized,
    displayName,
    avatarUrl: profile.avatarUrl,
    spotifyId: profile.spotifyId,
    spotifyUrl: profile.spotifyUrl,
    spotifyFollowers: profile.spotifyFollowers ?? null,
    latestRelease: profile.latestRelease
      ? {
          title: profile.latestRelease.title,
          slug: profile.latestRelease.slug,
          artworkUrl: profile.latestRelease.artworkUrl,
          releaseDate: profile.latestRelease.releaseDate,
          revealDate: profile.latestRelease.revealDate,
          releaseType: profile.latestRelease.releaseType,
        }
      : null,
    genres: profile.genres ?? [],
    socialLinks: links.urls,
    linkPlatforms: links.platforms,
    linkCount: links.urls.length,
  };
}

/** Existing chat command submitted by the explicit profile continuation action. */
export function buildStartEntryDraft(
  entry: StartEntryProfile | null
): string | null {
  if (!entry || entry.status === 'claimed') return null;
  if (entry.status === 'available' && entry.displayName) {
    return `My name is ${JSON.stringify(entry.displayName)}. I want to preview jov.ie/${entry.handle} before saving.`;
  }
  return `I want to claim jov.ie/${entry.handle}.`;
}
