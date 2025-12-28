/**
 * Test Data Factories
 *
 * Factory functions for creating consistent test data. These factories help:
 * - Ensure test isolation by generating unique data per test
 * - Provide sensible defaults while allowing customization
 * - Reduce boilerplate in test files
 * - Make tests more readable and maintainable
 *
 * Usage:
 * ```typescript
 * import { factories } from './test-utils/factories';
 *
 * const user = factories.user({ name: 'Custom Name' });
 * const profile = factories.creatorProfile({ userId: user.id });
 * ```
 */

// ============================================================================
// ID Generators
// ============================================================================

/**
 * Counter for generating unique IDs within a test run.
 * Reset between tests via the setup.ts cleanup.
 */
let idCounter = 0;

/**
 * Generate a unique test ID with optional prefix.
 * Format: prefix-timestamp-counter or uuid format with test marker.
 */
export function generateTestId(prefix = 'test'): string {
  idCounter++;
  return `${prefix}-${Date.now()}-${idCounter}`;
}

/**
 * Generate a valid UUID v4 format ID for database entities.
 * Uses a deterministic pattern for easier debugging while
 * remaining unique within a test run.
 */
export function generateUUID(): string {
  idCounter++;
  const timestamp = Date.now().toString(16).slice(-8);
  const counter = idCounter.toString(16).padStart(4, '0');
  // Format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx (UUID v4-like for testing)
  // Note: Not cryptographically valid, deterministic for test debugging
  const variant = ['8', '9', 'a', 'b'][idCounter % 4];
  return `${timestamp}-${counter}-4000-${variant}000-${counter.padStart(12, '0')}`;
}

/**
 * Generate a deterministic UUID based on a seed string.
 * Useful for tests that need consistent IDs across runs.
 */
export function seededUUID(seed: string): string {
  // Simple hash function to generate deterministic IDs
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    const char = seed.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  const hex = Math.abs(hash).toString(16).padStart(8, '0');
  // Repeat hex to ensure we have enough characters for all segments
  const hexExtended = (hex + hex + hex).slice(0, 32);
  return `${hexExtended.slice(0, 8)}-${hexExtended.slice(8, 12)}-4000-8000-${hexExtended.slice(12, 24)}`;
}

/**
 * Reset the ID counter. Called automatically in afterEach by setup.ts.
 */
export function resetIdCounter(): void {
  idCounter = 0;
}

// ============================================================================
// Timestamp Generators
// ============================================================================

/**
 * Generate a timestamp for test data.
 * Defaults to current time but can be offset.
 */
export function generateTimestamp(offsetMs = 0): Date {
  return new Date(Date.now() + offsetMs);
}

/**
 * Generate a timestamp in ISO string format.
 */
export function generateISOTimestamp(offsetMs = 0): string {
  return generateTimestamp(offsetMs).toISOString();
}

// ============================================================================
// User Factory
// ============================================================================

export interface UserFactoryOptions {
  id?: string;
  clerkId?: string;
  name?: string;
  email?: string;
  isAdmin?: boolean;
  isPro?: boolean;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export function createUser(options: UserFactoryOptions = {}) {
  const id = options.id ?? generateUUID();
  const timestamp = generateTimestamp();

  return {
    id,
    clerkId: options.clerkId ?? `clerk_${generateTestId()}`,
    name: options.name ?? 'Test User',
    email: options.email ?? `test-${generateTestId()}@example.com`,
    isAdmin: options.isAdmin ?? false,
    isPro: options.isPro ?? false,
    stripeCustomerId: options.stripeCustomerId ?? null,
    stripeSubscriptionId: options.stripeSubscriptionId ?? null,
    billingUpdatedAt: null,
    billingVersion: 1,
    lastBillingEventAt: null,
    deletedAt: null,
    createdAt: options.createdAt ?? timestamp,
    updatedAt: options.updatedAt ?? timestamp,
  };
}

// ============================================================================
// Creator Profile Factory
// ============================================================================

export interface CreatorProfileFactoryOptions {
  id?: string;
  userId?: string | null;
  username?: string;
  displayName?: string;
  bio?: string;
  creatorType?: 'artist' | 'podcaster' | 'influencer' | 'creator';
  avatarUrl?: string | null;
  spotifyUrl?: string | null;
  appleMusicUrl?: string | null;
  youtubeUrl?: string | null;
  spotifyId?: string | null;
  isPublic?: boolean;
  isVerified?: boolean;
  isFeatured?: boolean;
  isClaimed?: boolean;
  venmoHandle?: string | null;
  ingestionStatus?: 'idle' | 'pending' | 'processing' | 'failed';
  createdAt?: Date;
  updatedAt?: Date;
}

export function createCreatorProfile(
  options: CreatorProfileFactoryOptions = {}
) {
  const id = options.id ?? generateUUID();
  const username = options.username ?? `testartist${generateTestId()}`;
  const timestamp = generateTimestamp();

  return {
    id,
    userId: options.userId ?? null,
    username,
    usernameNormalized: username.toLowerCase(),
    displayName: options.displayName ?? 'Test Artist',
    bio: options.bio ?? 'A test artist profile',
    creatorType: options.creatorType ?? 'artist',
    avatarUrl: options.avatarUrl ?? null,
    spotifyUrl: options.spotifyUrl ?? null,
    appleMusicUrl: options.appleMusicUrl ?? null,
    youtubeUrl: options.youtubeUrl ?? null,
    spotifyId: options.spotifyId ?? null,
    isPublic: options.isPublic ?? true,
    isVerified: options.isVerified ?? false,
    isFeatured: options.isFeatured ?? false,
    isClaimed: options.isClaimed ?? false,
    marketingOptOut: false,
    claimToken: null,
    claimedAt: null,
    claimTokenExpiresAt: null,
    claimedFromIp: null,
    claimedUserAgent: null,
    avatarLockedByUser: false,
    displayNameLocked: false,
    ingestionStatus: options.ingestionStatus ?? 'idle',
    lastIngestionError: null,
    lastLoginAt: null,
    profileViews: 0,
    onboardingCompletedAt: null,
    venmoHandle: options.venmoHandle ?? null,
    settings: {},
    theme: {},
    createdAt: options.createdAt ?? timestamp,
    updatedAt: options.updatedAt ?? timestamp,
  };
}

// ============================================================================
// Social Link Factory
// ============================================================================

export interface SocialLinkFactoryOptions {
  id?: string;
  profileId?: string;
  platformId?: string;
  platformType?: 'social' | 'music' | 'video' | 'other';
  url?: string;
  displayText?: string | null;
  sortOrder?: number;
  isActive?: boolean;
  state?: 'active' | 'suggested' | 'rejected';
  confidence?: number;
  sourcePlatform?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export function createSocialLink(options: SocialLinkFactoryOptions = {}) {
  const id = options.id ?? generateUUID();
  const profileId = options.profileId ?? generateUUID();
  const timestamp = generateTimestamp();

  return {
    id,
    profileId,
    platformId: options.platformId ?? 'instagram',
    platformType: options.platformType ?? 'social',
    url: options.url ?? `https://instagram.com/${generateTestId()}`,
    displayText: options.displayText ?? null,
    sortOrder: options.sortOrder ?? 0,
    isActive: options.isActive ?? true,
    state: options.state ?? 'active',
    confidence: options.confidence ?? 1.0,
    sourcePlatform: options.sourcePlatform ?? null,
    evidence: { sources: [], signals: [] },
    createdAt: options.createdAt ?? timestamp,
    updatedAt: options.updatedAt ?? timestamp,
  };
}

// ============================================================================
// Click Event Factory
// ============================================================================

export interface ClickEventFactoryOptions {
  id?: string;
  profileId?: string;
  linkType?: string;
  linkUrl?: string;
  ipHash?: string | null;
  userAgent?: string | null;
  referrer?: string | null;
  country?: string | null;
  city?: string | null;
  isBot?: boolean;
  createdAt?: Date;
}

export function createClickEvent(options: ClickEventFactoryOptions = {}) {
  const id = options.id ?? generateUUID();
  const timestamp = generateTimestamp();

  return {
    id,
    profileId: options.profileId ?? generateUUID(),
    linkType: options.linkType ?? 'social',
    linkUrl: options.linkUrl ?? 'https://example.com/link',
    ipHash: options.ipHash ?? null,
    userAgent: options.userAgent ?? 'Mozilla/5.0 Test Browser',
    referrer: options.referrer ?? null,
    country: options.country ?? 'US',
    city: options.city ?? null,
    isBot: options.isBot ?? false,
    createdAt: options.createdAt ?? timestamp,
  };
}

// ============================================================================
// Audience Member Factory
// ============================================================================

export interface AudienceMemberFactoryOptions {
  id?: string;
  profileId?: string;
  memberType?: 'anonymous' | 'email' | 'sms' | 'spotify' | 'customer';
  fingerprint?: string;
  email?: string | null;
  phone?: string | null;
  spotifyId?: string | null;
  visits?: number;
  engagementScore?: number;
  deviceType?: 'mobile' | 'desktop' | 'tablet' | 'unknown';
  geoCity?: string | null;
  geoCountry?: string | null;
  spotifyConnected?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export function createAudienceMember(
  options: AudienceMemberFactoryOptions = {}
) {
  const id = options.id ?? generateUUID();
  const timestamp = generateTimestamp();

  return {
    id,
    profileId: options.profileId ?? generateUUID(),
    memberType: options.memberType ?? 'anonymous',
    fingerprint: options.fingerprint ?? `fp_${generateTestId()}`,
    email: options.email ?? null,
    phone: options.phone ?? null,
    spotifyId: options.spotifyId ?? null,
    visits: options.visits ?? 1,
    engagementScore: options.engagementScore ?? 0,
    latestActions: [],
    deviceType: options.deviceType ?? 'desktop',
    geoCity: options.geoCity ?? null,
    geoCountry: options.geoCountry ?? null,
    spotifyConnected: options.spotifyConnected ?? false,
    firstSeenAt: timestamp,
    lastSeenAt: timestamp,
    createdAt: options.createdAt ?? timestamp,
    updatedAt: options.updatedAt ?? timestamp,
  };
}

// ============================================================================
// Tip Factory
// ============================================================================

export interface TipFactoryOptions {
  id?: string;
  profileId?: string;
  amount?: number;
  currency?: string;
  stripePaymentIntentId?: string | null;
  status?: 'pending' | 'succeeded' | 'failed';
  message?: string | null;
  isAnonymous?: boolean;
  createdAt?: Date;
}

export function createTip(options: TipFactoryOptions = {}) {
  const id = options.id ?? generateUUID();
  const timestamp = generateTimestamp();

  return {
    id,
    profileId: options.profileId ?? generateUUID(),
    amount: options.amount ?? 500, // $5.00 in cents
    currency: options.currency ?? 'USD',
    stripePaymentIntentId:
      options.stripePaymentIntentId ?? `pi_${generateTestId()}`,
    status: options.status ?? 'pending',
    message: options.message ?? null,
    isAnonymous: options.isAnonymous ?? false,
    tipperName: null,
    tipperEmail: null,
    createdAt: options.createdAt ?? timestamp,
  };
}

// ============================================================================
// Mock Request/Response Factories
// ============================================================================

export interface MockRequestOptions {
  method?: string;
  url?: string;
  headers?: Record<string, string>;
  body?: unknown;
  searchParams?: Record<string, string>;
}

/**
 * Create a mock NextRequest-like object for API route testing.
 */
export function createMockRequest(options: MockRequestOptions = {}) {
  const url = new URL(options.url ?? 'https://example.com/api/test');

  // Add search params
  if (options.searchParams) {
    for (const [key, value] of Object.entries(options.searchParams)) {
      url.searchParams.set(key, value);
    }
  }

  return {
    method: options.method ?? 'GET',
    url: url.toString(),
    nextUrl: url,
    headers: new Headers(options.headers ?? {}),
    json: async () => options.body ?? {},
    text: async () => JSON.stringify(options.body ?? {}),
    cookies: {
      get: () => undefined,
      getAll: () => [],
      has: () => false,
    },
    geo: {
      city: 'Test City',
      country: 'US',
      region: 'CA',
    },
  };
}

/**
 * Create a mock Response object for testing.
 */
export function createMockResponse(body: unknown, options: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
}

// ============================================================================
// Mock Database Result Factories
// ============================================================================

/**
 * Create a mock database query result.
 */
export function createMockDbResult<T>(data: T[]) {
  return Promise.resolve(data);
}

/**
 * Create a mock database insert result.
 */
export function createMockInsertResult<T extends { id: string }>(data: T) {
  return Promise.resolve([data]);
}

/**
 * Create a mock Drizzle-style query builder.
 * Useful for mocking complex queries in tests.
 */
export function createMockQueryBuilder<T>(result: T[]) {
  const mockChain = {
    from: () => mockChain,
    where: () => mockChain,
    and: () => mockChain,
    or: () => mockChain,
    limit: () => mockChain,
    offset: () => mockChain,
    orderBy: () => mockChain,
    leftJoin: () => mockChain,
    innerJoin: () => mockChain,
    then: (resolve: (value: T[]) => void) => resolve(result),
  };

  return {
    select: () => mockChain,
    insert: () => ({
      values: () => ({
        returning: () => Promise.resolve(result),
        onConflictDoNothing: () => ({
          returning: () => Promise.resolve(result),
        }),
        onConflictDoUpdate: () => ({
          returning: () => Promise.resolve(result),
        }),
      }),
    }),
    update: () => ({
      set: () => ({
        where: () => Promise.resolve(result),
        returning: () => Promise.resolve(result),
      }),
    }),
    delete: () => ({
      where: () => Promise.resolve(result),
      returning: () => Promise.resolve(result),
    }),
  };
}

// ============================================================================
// Unified Factory Export
// ============================================================================

/**
 * All factories bundled together for easy importing.
 *
 * @example
 * import { factories } from './test-utils/factories';
 * const user = factories.user();
 * const profile = factories.creatorProfile({ userId: user.id });
 */
export const factories = {
  // ID generators
  id: generateTestId,
  uuid: generateUUID,
  seededUUID,
  resetIdCounter,

  // Timestamp generators
  timestamp: generateTimestamp,
  isoTimestamp: generateISOTimestamp,

  // Entity factories
  user: createUser,
  creatorProfile: createCreatorProfile,
  socialLink: createSocialLink,
  clickEvent: createClickEvent,
  audienceMember: createAudienceMember,
  tip: createTip,

  // Request/Response factories
  request: createMockRequest,
  response: createMockResponse,

  // Database mock factories
  dbResult: createMockDbResult,
  insertResult: createMockInsertResult,
  queryBuilder: createMockQueryBuilder,
};

export default factories;
