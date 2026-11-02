import { RETURNING_CANARY_RESERVED_ARTIST } from './prodcert-artist-fixture';
import {
  PRODCERT_CHAT_HEALTH_CANARY_EMAIL,
  PRODCERT_RETURNING_CANARY_EMAIL,
} from './prodcert-identities';

/**
 * Declarative, versioned seed for the production certification canaries
 * (2026-10-31 golden-path cert).
 *
 * The returning-creator canary used to be a synthetic "Browse Ready User"
 * with no artist identity and no releases, so the golden-path walk saw a fake,
 * empty page. It now carries a real public artist from the shared e2e pool
 * (`RETURNING_CANARY_RESERVED_ARTIST`, excluded from the run-time claim pool)
 * and its catalog is imported by the product's own onboarding importer.
 *
 * `scripts/seed-returning-canary.ts` applies this spec idempotently. Bump
 * `CANARY_SEED_SPEC_VERSION` whenever a value below changes.
 */
export const CANARY_SEED_SPEC_VERSION = 'canary-seed/2026-10-31.2';

export interface CanarySeedIdentity {
  readonly email: string;
  readonly handle: string;
  readonly displayName: string;
  readonly bio: string;
  /** Real public artist bound to the profile; null for a profile-only canary. */
  readonly artist: {
    readonly spotifyId: string;
    readonly name: string;
    readonly url: string;
  } | null;
}

export const RETURNING_CANARY_SEED: CanarySeedIdentity = Object.freeze({
  email: PRODCERT_RETURNING_CANARY_EMAIL,
  handle: 'gooddropouts',
  displayName: RETURNING_CANARY_RESERVED_ARTIST.name,
  bio: 'Public catalog and links, imported from Spotify.',
  artist: RETURNING_CANARY_RESERVED_ARTIST,
});

/** Profile-only account for the post-deploy `/api/chat` health check. */
export const CHAT_HEALTH_CANARY_SEED: CanarySeedIdentity = Object.freeze({
  email: PRODCERT_CHAT_HEALTH_CANARY_EMAIL,
  handle: 'jovie-chat-health',
  displayName: 'Chat Health Check',
  bio: 'Internal account used by the post-deploy chat health check.',
  artist: null,
});

export const CANARY_SEED_IDENTITIES: readonly CanarySeedIdentity[] =
  Object.freeze([RETURNING_CANARY_SEED, CHAT_HEALTH_CANARY_SEED]);

/** Every email the seed script may write for; anything else is refused. */
export function isCanarySeedEmail(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  return CANARY_SEED_IDENTITIES.some(i => i.email === normalized);
}

export interface CanaryProfileSnapshot {
  readonly profileId: string;
  readonly ownerEmail: string;
  readonly username: string | null;
  readonly displayName: string | null;
  readonly bio: string | null;
  readonly spotifyId: string | null;
  readonly spotifyUrl: string | null;
  readonly avatarUrl: string | null;
  /**
   * A canary must stay published: the app shell treats `is_public=false` as an
   * unfinished profile and sends the owner to /start, so the post-deploy chat
   * check could never reach /app/chat (2026-10-31, a test-profile cleanup run
   * unpublished the chat-health canary).
   */
  readonly isPublic: boolean | null;
}

export type CanarySeedValue =
  | string
  | number
  | boolean
  | readonly string[]
  | null;

export interface CanaryArtistData {
  readonly imageUrl: string | null;
  readonly genres: readonly string[];
  readonly followerCount: number;
  readonly popularity: number;
}

export interface CanaryProfileUpdate {
  readonly table: 'creator_profiles';
  readonly key: { readonly id: string };
  readonly set: Readonly<Record<string, CanarySeedValue>>;
}

/**
 * Pure planner: the exact `creator_profiles` writes that bring one canary to
 * its spec. Refuses a profile owned by anyone but the spec's canary, and a
 * Spotify id bound to some other profile. Returns [] when already converged.
 */
export function planCanaryProfileUpdate(
  spec: CanarySeedIdentity,
  current: CanaryProfileSnapshot,
  artist: CanaryArtistData | null,
  spotifyBoundElsewhere: boolean
): readonly CanaryProfileUpdate[] {
  if (current.ownerEmail.trim().toLowerCase() !== spec.email) {
    throw new Error(
      `Refusing to seed: profile ${current.profileId} is not owned by ${spec.email}`
    );
  }
  if (spec.artist && spotifyBoundElsewhere) {
    throw new Error(
      `Refusing to seed: Spotify id ${spec.artist.spotifyId} is bound to another profile`
    );
  }
  const desired: Record<string, CanarySeedValue> = {
    username: spec.handle,
    username_normalized: spec.handle,
    display_name: spec.displayName,
    bio: spec.bio,
    is_public: true,
  };
  if (spec.artist) {
    desired.spotify_id = spec.artist.spotifyId;
    desired.spotify_url = spec.artist.url;
    if (artist?.imageUrl?.startsWith('https://i.scdn.co/')) {
      desired.avatar_url = artist.imageUrl;
    }
  }
  const currentByColumn: Record<string, CanarySeedValue> = {
    username: current.username,
    username_normalized: current.username,
    display_name: current.displayName,
    bio: current.bio,
    spotify_id: current.spotifyId,
    spotify_url: current.spotifyUrl,
    avatar_url: current.avatarUrl,
    is_public: current.isPublic,
  };
  const changed = Object.fromEntries(
    Object.entries(desired).filter(([k, v]) => currentByColumn[k] !== v)
  );
  return Object.keys(changed).length === 0
    ? []
    : [
        {
          table: 'creator_profiles',
          key: { id: current.profileId },
          set: changed,
        },
      ];
}
