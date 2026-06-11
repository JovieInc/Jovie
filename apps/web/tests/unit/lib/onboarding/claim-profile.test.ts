import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockDbSelect,
  mockDbUpdate,
  mockDbInsert,
  mockReserveOnboardingHandle,
  mockDeriveClaimedOnboardingStateFromMessageRows,
} = vi.hoisted(() => ({
  mockDbSelect: vi.fn(),
  mockDbUpdate: vi.fn(),
  mockDbInsert: vi.fn(),
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

vi.mock('@/lib/onboarding/claimed-state', () => ({
  deriveClaimedOnboardingStateFromMessageRows:
    mockDeriveClaimedOnboardingStateFromMessageRows,
}));

vi.mock('@/lib/onboarding/reserved-handle', () => ({
  reserveOnboardingHandle: mockReserveOnboardingHandle,
}));

import { materializeClaimedOnboardingProfile } from '@/lib/onboarding/claim-profile';

const HANDLE_UNIQUE_VIOLATION = new Error(
  'duplicate key value violates unique constraint "creator_profiles_username_normalized_unique"'
);

function setupMessageSelect() {
  const orderBy = vi.fn().mockResolvedValue([{ toolCalls: [] }]);
  const where = vi.fn().mockReturnValue({ orderBy });
  const from = vi.fn().mockReturnValue({ where });
  mockDbSelect.mockReturnValueOnce({ from });
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
) {
  const outcomes = Array.isArray(outcome) ? outcome : [outcome];

  for (const current of outcomes) {
    const returning =
      'error' in current
        ? vi.fn().mockRejectedValue(current.error)
        : vi.fn().mockResolvedValue([current]);
    const values = vi.fn().mockReturnValue({ returning });
    mockDbInsert.mockReturnValueOnce({ values });
  }
}

function queueProfileUpdate(
  outcome:
    | { id: string }
    | { error: Error }
    | Array<{ id: string } | { error: Error }>
) {
  const outcomes = Array.isArray(outcome) ? outcome : [outcome];

  for (const current of outcomes) {
    const returning =
      'error' in current
        ? vi.fn().mockRejectedValue(current.error)
        : vi.fn().mockResolvedValue([current]);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    mockDbUpdate.mockReturnValueOnce({ set });
  }
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
  });

  it('skips when chat state has no materializable profile data', async () => {
    mockDeriveClaimedOnboardingStateFromMessageRows.mockReturnValue({
      artist: null,
      handle: null,
      socialLinks: [],
      interviewSignals: [],
    });
    setupMessageSelect();

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

    expect(mockDbSelect).toHaveBeenCalledTimes(1);
    expect(mockDbInsert).not.toHaveBeenCalled();
  });

  it('creates a profile using the proposed handle without a pre-insert availability check', async () => {
    setupMessageSelect();
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

  it('retries with a reserved handle when INSERT hits a username unique violation', async () => {
    setupMessageSelect();
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
    expect(mockReserveOnboardingHandle).toHaveBeenCalledWith('coolartist');
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

    setupMessageSelect();
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

    expect(mockReserveOnboardingHandle).toHaveBeenCalledWith('The Weeknd');
  });

  it('updates an existing profile and retries on handle conflict', async () => {
    setupMessageSelect();
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
