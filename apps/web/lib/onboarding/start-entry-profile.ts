import { cleanScrapedDisplayName } from '@/lib/profile/scraped-display-name';
import {
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
  USERNAME_PATTERN,
} from '@/lib/validation/username-core';

const MAX_ENTRY_LINKS = 8;

/**
 * What `/start?handle=<handle>` knows about the visitor before they type
 * (JOV-7753). Outreach and claim links carry the handle; the first screen
 * shows the real page behind it instead of a blank prompt.
 */
export type StartEntryProfile =
  | {
      readonly status: 'claimable';
      readonly handle: string;
      readonly displayName: string;
      readonly avatarUrl: string | null;
      readonly spotifyId: string | null;
      readonly spotifyUrl: string | null;
      readonly genres: readonly string[];
      readonly socialLinks: readonly string[];
      /** Distinct platforms behind those links, for the entry card icon row. */
      readonly linkPlatforms: readonly string[];
      readonly linkCount: number;
    }
  | {
      readonly status: 'claimed';
      readonly handle: string;
      readonly displayName: string;
      readonly avatarUrl: string | null;
    }
  | { readonly status: 'available'; readonly handle: string };

export interface StartEntryProfileSource {
  readonly usernameNormalized: string;
  readonly displayName: string | null;
  readonly avatarUrl: string | null;
  readonly isPublic: boolean | null;
  readonly isClaimed: boolean | null;
  readonly spotifyId: string | null;
  readonly spotifyUrl: string | null;
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
  const raw = params.handle;
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

function httpsUrls(links: readonly { readonly url: string }[]): string[] {
  const urls: string[] = [];
  for (const link of links) {
    try {
      const parsed = new URL(link.url);
      if (parsed.protocol === 'https:' && !urls.includes(parsed.toString())) {
        urls.push(parsed.toString());
      }
    } catch {
      // Skip malformed stored links rather than failing the entry screen.
    }
    if (urls.length >= MAX_ENTRY_LINKS) break;
  }
  return urls;
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
      handle: profile.usernameNormalized,
      displayName,
      avatarUrl: profile.avatarUrl,
    };
  }

  return {
    status: 'claimable',
    handle: profile.usernameNormalized,
    displayName,
    avatarUrl: profile.avatarUrl,
    spotifyId: profile.spotifyId,
    spotifyUrl: profile.spotifyUrl,
    genres: profile.genres ?? [],
    socialLinks: httpsUrls(profile.socialLinks),
    linkPlatforms: [
      ...new Set(profile.socialLinks.map(link => link.platform.toLowerCase())),
    ],
    linkCount: profile.socialLinks.length,
  };
}

/** Draft placed in the composer (not auto-sent) for claimable and open handles. */
export function buildStartEntryDraft(
  entry: StartEntryProfile | null
): string | null {
  if (!entry || entry.status === 'claimed') return null;
  return `I want to claim jov.ie/${entry.handle}.`;
}
