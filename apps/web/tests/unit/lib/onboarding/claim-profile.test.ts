import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockDbSelect,
  mockDbUpdate,
  mockDbInsert,
  mockFetchArtistBySpotifyUrl,
  mockReserveOnboardingHandle,
  mockDeriveClaimedOnboardingStateFromMessageRows,
} = vi.hoisted(() => ({
  mockDbSelect: vi.fn(),
  mockDbUpdate: vi.fn(),
  mockDbInsert: vi.fn(),
  mockFetchArtistBySpotifyUrl: vi.fn(),
  mockReserveOnboardingHandle: vi.fn(),
  mockDeriveClaimedOnboardingStateFromMessageRows: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: mockDbSelect,
    update: mockDbUpdate,
    insert: mockDbInsert,
  },
}));

vi.mock('@/lib/db/schema/auth', () => ({
  users: {
    id: 'users.id',
    activeProfileId: 'users.active_profile_id',
    updatedAt: 'users.updated_at',
  },
}));

vi.mock('@/lib/db/schema/chat', () => ({
  chatMessages: {
    toolCalls: 'chat_messages.tool_calls',
    conversationId: 'chat_messages.conversation_id',
    createdAt: 'chat_messages.created_at',
  },
  chatConversations: {
    id: 'chat_conversations.id',
    userId: 'chat_conversations.user_id',
    creatorProfileId: 'chat_conversations.creator_profile_id',
    updatedAt: 'chat_conversations.updated_at',
  },
  chatAuditLog: {
    userId: 'chat_audit_log.user_id',
    creatorProfileId: 'chat_audit_log.creator_profile_id',
    conversationId: 'chat_audit_log.conversation_id',
    action: 'chat_audit_log.action',
    field: 'chat_audit_log.field',
    previousValue: 'chat_audit_log.previous_value',
    newValue: 'chat_audit_log.new_value',
    metadata: 'chat_audit_log.metadata',
    ipAddress: 'chat_audit_log.ip_address',
    userAgent: 'chat_audit_log.user_agent',
  },
}));

vi.mock('@/lib/db/schema/profiles', () => ({
  creatorProfiles: {
    bio: 'creator_profiles.bio',
    id: 'creator_profiles.id',
    userId: 'creator_profiles.user_id',
    username: 'creator_profiles.username',
    usernameNormalized: 'creator_profiles.username_normalized',
    displayName: 'creator_profiles.display_name',
    displayNameLocked: 'creator_profiles.display_name_locked',
    isClaimed: 'creator_profiles.is_claimed',
    isPublic: 'creator_profiles.is_public',
    claimedAt: 'creator_profiles.claimed_at',
    onboardingCompletedAt: 'creator_profiles.onboarding_completed_at',
    settings: 'creator_profiles.settings',
    updatedAt: 'creator_profiles.updated_at',
    avatarLockedByUser: 'creator_profiles.avatar_locked_by_user',
    avatarUrl: 'creator_profiles.avatar_url',
    creatorType: 'creator_profiles.creator_type',
    genres: 'creator_profiles.genres',
    spotifyFollowers: 'creator_profiles.spotify_followers',
    spotifyId: 'creator_profiles.spotify_id',
    spotifyPopularity: 'creator_profiles.spotify_popularity',
    spotifyUrl: 'creator_profiles.spotify_url',
    theme: 'creator_profiles.theme',
    ingestionStatus: 'creator_profiles.ingestion_status',
  },
  userProfileClaims: {
    userId: 'user_profile_claims.user_id',
    creatorProfileId: 'user_profile_claims.creator_profile_id',
    role: 'user_profile_claims.role',
  },
}));

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...args: unknown[]) => ({ and: args })),
  desc: vi.fn((col: unknown) => ({ desc: col })),
  eq: vi.fn((col: unknown, val: unknown) => ({ eq: [col, val] })),
}));

vi.mock('@/lib/dsp-enrichment/providers/musicfetch', () => ({
  fetchArtistBySpotifyUrl: mockFetchArtistBySpotifyUrl,
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: vi.fn(),
}));

vi.mock('@/lib/onboarding/claimed-state', () => ({
  deriveClaimedOnboardingStateFromMessageRows:
    mockDeriveClaimedOnboardingStateFromMessageRows,
}));

vi.mock('@/lib/onboarding/reserved-handle', () => ({
  reserveOnboardingHandle: mockReserveOnboardingHandle,
}));

vi.mock('@/lib/tasks/chat-work-record', () => ({
  ensureChatWorkRecord: vi.fn().mockResolvedValue(null),
}));

import { captureError } from '@/lib/error-tracking';
import { materializeClaimedOnboardingProfile } from '@/lib/onboarding/claim-profile';

const HANDLE_UNIQUE_VIOLATION = new Error(
  'duplicate key value violates unique constraint "creator_profiles_username_normalized_unique"'
);

function setupConversationSelect(
  conversation: { id: string; userId: string | null } | null
) {
  const limit = vi.fn().mockResolvedValue(conversation ? [conversation] : []);
  const where = vi.fn().mockReturnValue({ limit });
  const from = vi.fn().mockReturnValue({ where });
  mockDbSelect.mockReturnValueOnce({ from });
}

function setupMessageSelect() {
  const orderBy = vi.fn().mockResolvedValue([{ toolCalls: [] }]);
  const where = vi.fn().mockReturnValue({ orderBy });
  const from = vi.fn().mockReturnValue({ where });
  mockDbSelect.mockReturnValueOnce({ from });
}

function setupOwnedConversationAndMessages(userId = 'user_1') {
  setupConversationSelect({ id: 'conv_1', userId });
  setupMessageSelect();
}

function setupExistingProfileSelect(profile: Record<string, unknown> | null) {
  const limit = vi.fn().mockResolvedValue(profile ? [profile] : []);
  const orderBy = vi.fn().mockReturnValue({ limit });
  const where = vi.fn().mockReturnValue({ orderBy });
  const from = vi.fn().mockReturnValue({ where });
  mockDbSelect.mockReturnValueOnce({ from });
}

function queueProfileInsert(
  outcome:
    | { id: string }
    | { error: Error }
    | Array<{ id: string } | { error: Error }>
): ReturnType<typeof vi.fn>[] {
  const outcomes = Array.isArray(outcome) ? outcome : [outcome];
  const valueSpies: ReturnType<typeof vi.fn>[] = [];

  for (const current of outcomes) {
    const returning =
      'error' in current
        ? vi.fn().mockRejectedValue(current.error)
        : vi.fn().mockResolvedValue([current]);
    const values = vi.fn().mockReturnValue({ returning });
    valueSpies.push(values);
    mockDbInsert.mockReturnValueOnce({ values });
  }

  return valueSpies;
}

function queueProfileUpdate(
  outcome:
    | { id: string }
    | { error: Error }
    | Array<{ id: string } | { error: Error }>
): ReturnType<typeof vi.fn>[] {
  const outcomes = Array.isArray(outcome) ? outcome : [outcome];
  const valueSpies: ReturnType<typeof vi.fn>[] = [];

  for (const current of outcomes) {
    const returning =
      'error' in current
        ? vi.fn().mockRejectedValue(current.error)
        : vi.fn().mockResolvedValue([current]);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    valueSpies.push(set);
    mockDbUpdate.mockReturnValueOnce({ set });
  }

  return valueSpies;
}

function queuePostPersistWrites() {
  const userWhere = vi.fn().mockResolvedValue(undefined);
  const userSet = vi.fn().mockReturnValue({ where: userWhere });
  mockDbUpdate.mockReturnValueOnce({ set: userSet });

  const claimValues = vi.fn().mockReturnValue({ onConflictDoNothing: vi.fn() });
  mockDbInsert.mockReturnValueOnce({ values: claimValues });

  const conversationWhere = vi.fn().mockResolvedValue(undefined);
  const conversationSet = vi.fn().mockReturnValue({ where: conversationWhere });
  mockDbUpdate.mockReturnValueOnce({ set: conversationSet });

  const auditValues = vi.fn().mockResolvedValue(undefined);
  mockDbInsert.mockReturnValueOnce({ values: auditValues });
}

// Reserved mode skips the users.activeProfileId update and the
// userProfileClaims row — only the conversation link and audit write remain.
function queueReservedPostPersistWrites() {
  const conversationWhere = vi.fn().mockResolvedValue(undefined);
  const conversationSet = vi.fn().mockReturnValue({ where: conversationWhere });
  mockDbUpdate.mockReturnValueOnce({ set: conversationSet });

  const auditValues = vi.fn().mockResolvedValue(undefined);
  mockDbInsert.mockReturnValueOnce({ values: auditValues });
}

describe('materializeClaimedOnboardingProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDeriveClaimedOnboardingStateFromMessageRows.mockReturnValue({
      artist: null,
      handle: 'coolartist',
      socialLinks: [],
      interviewSignals: [],
    });
    mockReserveOnboardingHandle.mockResolvedValue('coolartist1');
    mockFetchArtistBySpotifyUrl.mockResolvedValue(null);
  });

  it('fails closed with UNAUTHORIZED when userId is empty (no profile created)', async () => {
    await expect(
      materializeClaimedOnboardingProfile({
        userId: '',
        conversationId: 'conv_1',
        ipAddress: null,
        userAgent: null,
      })
    ).rejects.toMatchObject({
      errorCode: 'UNAUTHORIZED',
      status: 401,
    });

    expect(mockDbInsert).not.toHaveBeenCalled();
  });

  it('blocks non-owners when the conversation belongs to another user', async () => {
    setupConversationSelect({ id: 'conv_1', userId: 'other_user' });

    await expect(
      materializeClaimedOnboardingProfile({
        userId: 'user_1',
        conversationId: 'conv_1',
        ipAddress: null,
        userAgent: null,
      })
    ).rejects.toMatchObject({
      errorCode: 'FORBIDDEN',
      status: 403,
    });

    expect(mockDbInsert).not.toHaveBeenCalled();
    expect(mockReserveOnboardingHandle).not.toHaveBeenCalled();
  });

  it('skips when chat state has no materializable profile data', async () => {
    mockDeriveClaimedOnboardingStateFromMessageRows.mockReturnValue({
      artist: null,
      handle: null,
      socialLinks: [],
      interviewSignals: [],
    });
    setupOwnedConversationAndMessages();

    await expect(
      materializeClaimedOnboardingProfile({
        userId: 'user_1',
        conversationId: 'conv_1',
        ipAddress: null,
        userAgent: null,
      })
    ).resolves.toEqual({
      profileId: null,
      handle: null,
      status: 'skipped',
    });

    // conversation + messages
    expect(mockDbSelect).toHaveBeenCalledTimes(2);
    expect(mockDbInsert).not.toHaveBeenCalled();
  });

  it('creates a profile using the proposed handle without a pre-insert availability check', async () => {
    setupOwnedConversationAndMessages();
    setupExistingProfileSelect(null);
    queueProfileInsert({ id: 'profile_new' });
    queuePostPersistWrites();

    await expect(
      materializeClaimedOnboardingProfile({
        userId: 'user_1',
        conversationId: 'conv_1',
        ipAddress: '127.0.0.1',
        userAgent: 'vitest',
      })
    ).resolves.toEqual({
      profileId: 'profile_new',
      handle: 'coolartist',
      status: 'created',
    });

    expect(mockReserveOnboardingHandle).not.toHaveBeenCalled();
  });

  it('imports Spotify image and MusicFetch bio while creating the live profile', async () => {
    mockDeriveClaimedOnboardingStateFromMessageRows.mockReturnValue({
      artist: {
        id: 'spotify_1',
        name: 'Luna Waves',
        url: 'https://open.spotify.com/artist/spotify_1',
        imageUrl: 'https://i.scdn.co/image/luna.jpg',
        followers: 42_000,
        popularity: 61,
        genres: ['indie pop', 'dream pop'],
      },
      handle: 'lunawaves',
      socialLinks: [],
      interviewSignals: [],
    });
    mockFetchArtistBySpotifyUrl.mockResolvedValue({
      type: 'artist',
      name: 'Luna Waves',
      image: { url: 'https://i.scdn.co/image/luna-musicfetch.jpg' },
      bio: '  Luna Waves makes late-night pop from Los Angeles.  ',
      services: {},
    });

    setupOwnedConversationAndMessages();
    setupExistingProfileSelect(null);
    const [profileInsertValues] = queueProfileInsert({ id: 'profile_new' });
    queuePostPersistWrites();

    await expect(
      materializeClaimedOnboardingProfile({
        userId: 'user_1',
        conversationId: 'conv_1',
        ipAddress: null,
        userAgent: null,
      })
    ).resolves.toEqual({
      profileId: 'profile_new',
      handle: 'lunawaves',
      status: 'created',
    });

    expect(mockFetchArtistBySpotifyUrl).toHaveBeenCalledWith(
      'https://open.spotify.com/artist/spotify_1'
    );
    expect(profileInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        avatarUrl: 'https://i.scdn.co/image/luna.jpg',
        bio: 'Luna Waves makes late-night pop from Los Angeles.',
        displayName: 'Luna Waves',
        genres: ['indie pop', 'dream pop'],
        isClaimed: true,
        isPublic: true,
        spotifyFollowers: 42_000,
        spotifyId: 'spotify_1',
        spotifyPopularity: 61,
        spotifyUrl: 'https://open.spotify.com/artist/spotify_1',
      })
    );
  });

  it('finishes the claim with Spotify fields when MusicFetch is vendor-unavailable', async () => {
    mockDeriveClaimedOnboardingStateFromMessageRows.mockReturnValue({
      artist: {
        id: 'spotify_1',
        name: 'Luna Waves',
        url: 'https://open.spotify.com/artist/spotify_1',
        imageUrl: 'https://i.scdn.co/image/luna.jpg',
        followers: 42_000,
        popularity: 61,
        genres: ['indie pop'],
      },
      handle: 'lunawaves',
      socialLinks: [],
      interviewSignals: [],
    });
    const vendorUnavailable = new Error('MusicFetch vendor unavailable');
    vendorUnavailable.name = 'MusicfetchRequestError';
    (vendorUnavailable as Error & { statusCode: number }).statusCode = 401;
    mockFetchArtistBySpotifyUrl.mockRejectedValue(vendorUnavailable);

    setupOwnedConversationAndMessages();
    setupExistingProfileSelect(null);
    const [profileInsertValues] = queueProfileInsert({ id: 'profile_new' });
    queuePostPersistWrites();

    await expect(
      materializeClaimedOnboardingProfile({
        userId: 'user_1',
        conversationId: 'conv_1',
        ipAddress: null,
        userAgent: null,
      })
    ).resolves.toEqual({
      profileId: 'profile_new',
      handle: 'lunawaves',
      status: 'created',
    });

    expect(captureError).not.toHaveBeenCalled();
    expect(profileInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        avatarUrl: 'https://i.scdn.co/image/luna.jpg',
        displayName: 'Luna Waves',
        isClaimed: true,
        isPublic: true,
        spotifyId: 'spotify_1',
        spotifyUrl: 'https://open.spotify.com/artist/spotify_1',
      })
    );
    expect(profileInsertValues).toHaveBeenCalledWith(
      expect.not.objectContaining({ bio: expect.any(String) })
    );
  });

  it('retries with a reserved handle when INSERT hits a username unique violation', async () => {
    setupOwnedConversationAndMessages();
    setupExistingProfileSelect(null);
    queueProfileInsert([
      { error: HANDLE_UNIQUE_VIOLATION },
      { id: 'profile_retried' },
    ]);
    queuePostPersistWrites();

    await expect(
      materializeClaimedOnboardingProfile({
        userId: 'user_1',
        conversationId: 'conv_1',
        ipAddress: null,
        userAgent: null,
      })
    ).resolves.toEqual({
      profileId: 'profile_retried',
      handle: 'coolartist1',
      status: 'created',
    });

    expect(mockReserveOnboardingHandle).toHaveBeenCalledTimes(1);
    expect(mockReserveOnboardingHandle).toHaveBeenCalledWith(
      'coolartist',
      'user_1'
    );
  });

  it('reserves a fallback handle when the proposed handle is invalid', async () => {
    mockDeriveClaimedOnboardingStateFromMessageRows.mockReturnValue({
      artist: {
        id: 'spotify_1',
        name: 'The Weeknd',
        url: 'https://open.spotify.com/artist/1',
        imageUrl: null,
        followers: null,
        popularity: null,
        genres: [],
      },
      handle: '@@@',
      socialLinks: [],
      interviewSignals: [],
    });
    mockReserveOnboardingHandle.mockResolvedValue('theweeknd');

    setupOwnedConversationAndMessages();
    setupExistingProfileSelect(null);
    queueProfileInsert({ id: 'profile_reserved' });
    queuePostPersistWrites();

    await expect(
      materializeClaimedOnboardingProfile({
        userId: 'user_1',
        conversationId: 'conv_1',
        ipAddress: null,
        userAgent: null,
      })
    ).resolves.toMatchObject({
      profileId: 'profile_reserved',
      handle: 'theweeknd',
      status: 'created',
    });

    expect(mockReserveOnboardingHandle).toHaveBeenCalledWith(
      'The Weeknd',
      'user_1'
    );
  });

  it('updates an existing profile and retries on handle conflict', async () => {
    setupOwnedConversationAndMessages();
    setupExistingProfileSelect({
      id: 'profile_existing',
      userId: 'user_1',
      displayName: 'Cool Artist',
      displayNameLocked: false,
      claimedAt: null,
      onboardingCompletedAt: null,
      settings: {},
      avatarLockedByUser: false,
      avatarUrl: null,
    });

    queueProfileUpdate([
      { error: HANDLE_UNIQUE_VIOLATION },
      { id: 'profile_existing' },
    ]);
    queuePostPersistWrites();

    await expect(
      materializeClaimedOnboardingProfile({
        userId: 'user_1',
        conversationId: 'conv_1',
        ipAddress: null,
        userAgent: null,
      })
    ).resolves.toEqual({
      profileId: 'profile_existing',
      handle: 'coolartist1',
      status: 'updated',
    });

    expect(mockReserveOnboardingHandle).toHaveBeenCalledTimes(1);
  });
});

describe('materializeClaimedOnboardingProfile — reserved waitlist hold (JOV-7204)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDeriveClaimedOnboardingStateFromMessageRows.mockReturnValue({
      artist: null,
      handle: 'coolartist',
      socialLinks: [],
      interviewSignals: [],
    });
    mockReserveOnboardingHandle.mockResolvedValue('coolartist1');
    mockFetchArtistBySpotifyUrl.mockResolvedValue(null);
  });

  it('creates a hidden, unclaimed profile that holds the handle for the waitlist entry', async () => {
    setupOwnedConversationAndMessages();
    setupExistingProfileSelect(null);
    const [insertValues] = queueProfileInsert({ id: 'profile_reserved' });
    queueReservedPostPersistWrites();

    await expect(
      materializeClaimedOnboardingProfile({
        userId: 'user_1',
        conversationId: 'conv_1',
        ipAddress: null,
        userAgent: null,
        visibility: 'reserved',
        waitlistEntryId: 'entry_1',
      })
    ).resolves.toEqual({
      profileId: 'profile_reserved',
      handle: 'coolartist',
      status: 'created',
    });

    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        username: 'coolartist',
        usernameNormalized: 'coolartist',
        isPublic: false,
        isClaimed: false,
        claimedAt: null,
        onboardingCompletedAt: null,
        waitlistEntryId: 'entry_1',
      })
    );
    // No ownership-publish writes: only the conversation link update ran.
    expect(mockDbUpdate).toHaveBeenCalledTimes(1);
    // Only the profile insert + audit log — no userProfileClaims row.
    expect(mockDbInsert).toHaveBeenCalledTimes(2);
  });

  it('refuses a second claimant the held handle and reserves a fallback instead', async () => {
    setupOwnedConversationAndMessages('user_2');
    setupExistingProfileSelect(null);
    queueProfileInsert([
      { error: HANDLE_UNIQUE_VIOLATION },
      { id: 'profile_second' },
    ]);
    queueReservedPostPersistWrites();

    await expect(
      materializeClaimedOnboardingProfile({
        userId: 'user_2',
        conversationId: 'conv_1',
        ipAddress: null,
        userAgent: null,
        visibility: 'reserved',
        waitlistEntryId: 'entry_2',
      })
    ).resolves.toEqual({
      profileId: 'profile_second',
      handle: 'coolartist1',
      status: 'created',
    });

    expect(mockReserveOnboardingHandle).toHaveBeenCalledWith(
      'coolartist',
      'user_2'
    );
  });

  it('publishes the held profile when the admitted claim path runs after approval', async () => {
    setupOwnedConversationAndMessages();
    setupExistingProfileSelect({
      id: 'profile_held',
      userId: 'user_1',
      displayName: null,
      displayNameLocked: false,
      isClaimed: false,
      claimedAt: null,
      onboardingCompletedAt: null,
      settings: {},
      avatarLockedByUser: false,
      avatarUrl: null,
    });
    const [setSpy] = queueProfileUpdate({ id: 'profile_held' });
    queuePostPersistWrites();

    await expect(
      materializeClaimedOnboardingProfile({
        userId: 'user_1',
        conversationId: 'conv_1',
        ipAddress: null,
        userAgent: null,
      })
    ).resolves.toEqual({
      profileId: 'profile_held',
      handle: 'coolartist',
      status: 'updated',
    });

    expect(setSpy).toHaveBeenCalledWith(
      expect.objectContaining({ isPublic: true, isClaimed: true })
    );
  });
});
