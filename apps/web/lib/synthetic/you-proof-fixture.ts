/** Marketing proof for live jov.ie/you — claimable, never reserved. */

export const YOU_PROOF_FIXTURE_SCHEMA = 'jovie.you-proof-fixture/v1' as const;
export const YOU_PROOF_FIXTURE_VERSION = 'you-proof/2026-11-20.1' as const;
export const YOU_PROOF_HANDLE = 'you' as const;

export interface YouProofSocialLink {
  readonly platform: string;
  readonly platformType: string;
  readonly url: string;
  readonly displayText: string;
  readonly sortOrder: number;
}

export interface YouProofFixture {
  readonly schema: typeof YOU_PROOF_FIXTURE_SCHEMA;
  readonly version: typeof YOU_PROOF_FIXTURE_VERSION;
  readonly handle: typeof YOU_PROOF_HANDLE;
  readonly displayName: string;
  readonly bio: string;
  readonly tagline: string;
  readonly socialLinks: readonly YouProofSocialLink[];
  readonly release: {
    readonly title: string;
    readonly slug: string;
    readonly artworkPath: string;
  };
}

export const YOU_PROOF_FIXTURE: YouProofFixture = {
  schema: YOU_PROOF_FIXTURE_SCHEMA,
  version: YOU_PROOF_FIXTURE_VERSION,
  handle: YOU_PROOF_HANDLE,
  displayName: 'Your Name',
  bio: 'The link your music deserves. Streams, drops, tips, bookings, and fan capture in a single page.',
  tagline: 'Built for artists',
  socialLinks: [
    {
      platform: 'instagram',
      platformType: 'social',
      url: 'https://instagram.com/',
      displayText: 'Instagram',
      sortOrder: 0,
    },
    {
      platform: 'youtube',
      platformType: 'social',
      url: 'https://www.youtube.com/',
      displayText: 'YouTube',
      sortOrder: 1,
    },
  ],
  release: {
    title: 'First Light',
    slug: 'first-light',
    artworkPath: '/img/releases/first-light.jpg',
  },
};

export interface YouProofProfileSnapshot {
  readonly profileId: string;
  readonly ownerEmail: string;
  readonly username: string | null;
  readonly displayName: string | null;
  readonly bio: string | null;
  readonly isPublic: boolean | null;
  readonly isClaimed: boolean | null;
}

export type YouProofSeedValue = string | boolean | null;

export interface YouProofProfileUpdate {
  readonly table: 'creator_profiles';
  readonly key: { readonly id: string };
  readonly set: Readonly<Record<string, YouProofSeedValue>>;
}

export interface YouProofSocialLinkPlan {
  readonly platform: string;
  readonly url: string;
  readonly displayText: string;
  readonly sortOrder: number;
  readonly action: 'insert' | 'unchanged';
}

export interface YouProofPlan {
  readonly profileUpdates: readonly YouProofProfileUpdate[];
  readonly socialLinks: readonly YouProofSocialLinkPlan[];
  readonly blockers: readonly string[];
}

/** Pure planner. Never invents rows; claim path must already own `you`. */
export function planYouProofSeed(params: {
  readonly fixture?: YouProofFixture;
  readonly ownerEmail: string;
  readonly handleRow: {
    readonly profileId: string;
    readonly ownerEmail: string | null;
    readonly username: string | null;
    readonly displayName: string | null;
    readonly bio: string | null;
    readonly isPublic: boolean | null;
    readonly isClaimed: boolean | null;
  } | null;
  readonly ownerProfile: YouProofProfileSnapshot | null;
  readonly existingSocialPlatforms: ReadonlySet<string>;
}): YouProofPlan {
  const fixture = params.fixture ?? YOU_PROOF_FIXTURE;
  const ownerEmail = params.ownerEmail.trim().toLowerCase();
  const blockers: string[] = [];

  if (!ownerEmail || !ownerEmail.includes('@')) {
    blockers.push('owner-email is required (Tim-designated account).');
  }
  if (!params.handleRow) {
    blockers.push(
      `Handle "${fixture.handle}" is free. Claim via /start, then re-run --apply.`
    );
  } else if (
    (params.handleRow.ownerEmail ?? '').trim().toLowerCase() !== ownerEmail
  ) {
    blockers.push(
      `Handle "${fixture.handle}" owned by ${params.handleRow.ownerEmail ?? 'unknown'}, not ${ownerEmail}.`
    );
  }
  if (
    params.ownerProfile &&
    params.handleRow &&
    params.ownerProfile.profileId !== params.handleRow.profileId
  ) {
    blockers.push(
      `Owner ${ownerEmail} has a different profile (${params.ownerProfile.username ?? params.ownerProfile.profileId}).`
    );
  }

  const current = params.handleRow;
  if (!current || blockers.length > 0) {
    return { profileUpdates: [], socialLinks: [], blockers };
  }

  const desired: Record<string, YouProofSeedValue> = {
    username: fixture.handle,
    username_normalized: fixture.handle,
    display_name: fixture.displayName,
    bio: fixture.bio,
    is_public: true,
  };
  const currentByColumn: Record<string, YouProofSeedValue> = {
    username: current.username,
    username_normalized: current.username,
    display_name: current.displayName,
    bio: current.bio,
    is_public: current.isPublic,
  };
  const changed = Object.fromEntries(
    Object.entries(desired).filter(([k, v]) => currentByColumn[k] !== v)
  );
  const profileUpdates: YouProofProfileUpdate[] =
    Object.keys(changed).length === 0
      ? []
      : [
          {
            table: 'creator_profiles',
            key: { id: current.profileId },
            set: changed,
          },
        ];

  const socialLinks: YouProofSocialLinkPlan[] = fixture.socialLinks.map(
    link => ({
      platform: link.platform,
      url: link.url,
      displayText: link.displayText,
      sortOrder: link.sortOrder,
      action: params.existingSocialPlatforms.has(link.platform)
        ? 'unchanged'
        : 'insert',
    })
  );

  return { profileUpdates, socialLinks, blockers: [] };
}
