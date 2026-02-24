import { beforeEach, describe, expect, it, vi } from 'vitest';

// Hoist mocks
const {
  mockAuth,
  mockSelect,
  mockUpdate,
  mockGetAuthenticatedProfile,
  mockResolveTxt,
} = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockSelect: vi.fn(),
  mockUpdate: vi.fn(),
  mockGetAuthenticatedProfile: vi.fn(),
  mockResolveTxt: vi.fn(),
}));

// Mock dns/promises
vi.mock('node:dns/promises', () => ({
  default: { resolveTxt: mockResolveTxt },
  resolveTxt: mockResolveTxt,
}));

// Mock auth session
vi.mock('@/lib/auth/session', () => ({
  withDbSessionTx: async (
    operation: (
      tx: {
        select: typeof mockSelect;
        update: typeof mockUpdate;
      },
      userId: string
    ) => Promise<unknown>
  ) => {
    const { userId } = await mockAuth();
    if (!userId) throw new Error('Unauthorized');
    const tx = {
      select: mockSelect,
      update: mockUpdate,
    };
    return operation(tx as never, userId);
  },
}));

// Mock drizzle-orm
vi.mock('drizzle-orm', () => ({
  eq: vi.fn((_col, val) => ({ _type: 'eq', val })),
  and: vi.fn((...args) => ({ _type: 'and', args })),
  ne: vi.fn((_col, val) => ({ _type: 'ne', val })),
}));

// Mock db queries
vi.mock('@/lib/db/queries/shared', () => ({
  getAuthenticatedProfile: mockGetAuthenticatedProfile,
}));

// Mock schema
vi.mock('@/lib/db/schema/links', () => ({
  socialLinks: {
    id: 'id',
    platform: 'platform',
    url: 'url',
    verificationToken: 'verification_token',
    verificationStatus: 'verification_status',
    verificationCheckedAt: 'verification_checked_at',
    verifiedAt: 'verified_at',
    updatedAt: 'updated_at',
    creatorProfileId: 'creator_profile_id',
  },
}));

// Mock headers
vi.mock('@/lib/http/headers', () => ({
  NO_STORE_HEADERS: { 'Cache-Control': 'no-store' },
}));

// Mock parseJsonBody
vi.mock('@/lib/http/parse-json', () => ({
  parseJsonBody: async (req: Request) => {
    const body = await req.json();
    return { ok: true, data: body };
  },
}));

import { POST } from '@/app/api/dashboard/social-links/route.post';

// Helper to create request
function createRequest(body: Record<string, unknown>): Request {
  return new Request('http://localhost/api/dashboard/social-links', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// Helper to build chainable select mock
function buildSelectChain(rows: unknown[]) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(rows),
  };
  return chain;
}

// Helper to build chainable update mock
function buildUpdateChain() {
  const chain = {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(undefined),
  };
  return chain;
}

describe('POST /api/dashboard/social-links (verify website)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ userId: 'clerk-user-1' });
    mockGetAuthenticatedProfile.mockResolvedValue({
      id: 'profile-1',
      userId: 'clerk-user-1',
    });
  });

  it('returns 400 with missing_params when profileId is missing', async () => {
    const req = createRequest({ linkId: 'link-1' });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('missing_params');
    expect(body.error).toContain('Profile ID and link ID are required');
  });

  it('returns 400 with missing_params when linkId is missing', async () => {
    const req = createRequest({ profileId: 'profile-1' });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('missing_params');
  });

  it('returns 404 with profile_not_found when profile does not exist', async () => {
    mockGetAuthenticatedProfile.mockResolvedValue(null);
    const req = createRequest({ profileId: 'profile-1', linkId: 'link-1' });
    const res = await POST(req);

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.code).toBe('profile_not_found');
  });

  it('returns 404 with link_not_found when website link does not exist', async () => {
    // First select: link query returns empty
    const linkChain = buildSelectChain([]);
    mockSelect.mockReturnValueOnce(linkChain);

    const req = createRequest({ profileId: 'profile-1', linkId: 'link-1' });
    const res = await POST(req);

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.code).toBe('link_not_found');
  });

  it('returns 400 with missing_token when link has no verification token', async () => {
    const linkChain = buildSelectChain([
      {
        id: 'link-1',
        platform: 'website',
        url: 'https://example.com',
        verificationToken: null,
      },
    ]);
    mockSelect.mockReturnValueOnce(linkChain);

    const req = createRequest({ profileId: 'profile-1', linkId: 'link-1' });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('missing_token');
  });

  it('returns 400 with invalid_url when URL is not parsable', async () => {
    const linkChain = buildSelectChain([
      {
        id: 'link-1',
        platform: 'website',
        url: 'not-a-valid-url',
        verificationToken: 'jovie-verify=abc123',
      },
    ]);
    mockSelect.mockReturnValueOnce(linkChain);

    const req = createRequest({ profileId: 'profile-1', linkId: 'link-1' });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('invalid_url');
  });

  it('returns 409 with domain_already_claimed when another profile has verified the domain', async () => {
    // First select: the user's link
    const linkChain = buildSelectChain([
      {
        id: 'link-1',
        platform: 'website',
        url: 'https://example.com',
        verificationToken: 'jovie-verify=abc123',
      },
    ]);
    // Second select: existing verified claims
    const claimChain = buildSelectChain([
      { id: 'other-link', url: 'https://example.com' },
    ]);

    mockSelect.mockReturnValueOnce(linkChain).mockReturnValueOnce(claimChain);

    const req = createRequest({ profileId: 'profile-1', linkId: 'link-1' });
    const res = await POST(req);

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe('domain_already_claimed');
    expect(body.ok).toBe(false);
  });

  it('does not flag domain_already_claimed when different hostname is verified by another profile', async () => {
    const linkChain = buildSelectChain([
      {
        id: 'link-1',
        platform: 'website',
        url: 'https://example.com',
        verificationToken: 'jovie-verify=abc123',
      },
    ]);
    // Other profile verified a different domain
    const claimChain = buildSelectChain([
      { id: 'other-link', url: 'https://other-domain.com' },
    ]);
    const updateChain = buildUpdateChain();

    mockSelect.mockReturnValueOnce(linkChain).mockReturnValueOnce(claimChain);
    mockUpdate.mockReturnValueOnce(updateChain);

    // DNS check returns the token
    mockResolveTxt.mockResolvedValueOnce([['jovie-verify=abc123']]);

    const req = createRequest({ profileId: 'profile-1', linkId: 'link-1' });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.status).toBe('verified');
    expect(body.code).toBe('verified');
  });

  it('returns dns_not_found when TXT record does not match', async () => {
    const linkChain = buildSelectChain([
      {
        id: 'link-1',
        platform: 'website',
        url: 'https://example.com',
        verificationToken: 'jovie-verify=abc123',
      },
    ]);
    const claimChain = buildSelectChain([]);
    const updateChain = buildUpdateChain();

    mockSelect.mockReturnValueOnce(linkChain).mockReturnValueOnce(claimChain);
    mockUpdate.mockReturnValueOnce(updateChain);

    // DNS returns records but no match
    mockResolveTxt.mockResolvedValueOnce([['some-other-record']]);

    const req = createRequest({ profileId: 'profile-1', linkId: 'link-1' });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.status).toBe('pending');
    expect(body.code).toBe('dns_not_found');
  });

  it('returns dns_not_found when DNS resolution throws', async () => {
    const linkChain = buildSelectChain([
      {
        id: 'link-1',
        platform: 'website',
        url: 'https://example.com',
        verificationToken: 'jovie-verify=abc123',
      },
    ]);
    const claimChain = buildSelectChain([]);
    const updateChain = buildUpdateChain();

    mockSelect.mockReturnValueOnce(linkChain).mockReturnValueOnce(claimChain);
    mockUpdate.mockReturnValueOnce(updateChain);

    // DNS lookup fails entirely
    mockResolveTxt.mockRejectedValueOnce(new Error('ENOTFOUND'));

    const req = createRequest({ profileId: 'profile-1', linkId: 'link-1' });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.code).toBe('dns_not_found');
  });

  it('returns verified when TXT record matches', async () => {
    const linkChain = buildSelectChain([
      {
        id: 'link-1',
        platform: 'website',
        url: 'https://mysite.dev',
        verificationToken: 'jovie-verify=xyz789',
      },
    ]);
    const claimChain = buildSelectChain([]);
    const updateChain = buildUpdateChain();

    mockSelect.mockReturnValueOnce(linkChain).mockReturnValueOnce(claimChain);
    mockUpdate.mockReturnValueOnce(updateChain);

    mockResolveTxt.mockResolvedValueOnce([
      ['v=spf1 include:_spf.google.com'],
      ['jovie-verify=xyz789'],
    ]);

    const req = createRequest({ profileId: 'profile-1', linkId: 'link-1' });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.status).toBe('verified');
    expect(body.code).toBe('verified');
    expect(body.verificationToken).toBe('jovie-verify=xyz789');
  });

  it('updates database with verified status on success', async () => {
    const linkChain = buildSelectChain([
      {
        id: 'link-1',
        platform: 'website',
        url: 'https://example.com',
        verificationToken: 'jovie-verify=abc123',
      },
    ]);
    const claimChain = buildSelectChain([]);
    const updateChain = buildUpdateChain();

    mockSelect.mockReturnValueOnce(linkChain).mockReturnValueOnce(claimChain);
    mockUpdate.mockReturnValueOnce(updateChain);

    mockResolveTxt.mockResolvedValueOnce([['jovie-verify=abc123']]);

    const req = createRequest({ profileId: 'profile-1', linkId: 'link-1' });
    await POST(req);

    expect(mockUpdate).toHaveBeenCalled();
    const setCalls = updateChain.set.mock.calls;
    expect(setCalls).toHaveLength(1);
    const setArg = setCalls[0][0];
    expect(setArg.verificationStatus).toBe('verified');
    expect(setArg.verifiedAt).toBeInstanceOf(Date);
  });

  it('updates database with pending status on failure', async () => {
    const linkChain = buildSelectChain([
      {
        id: 'link-1',
        platform: 'website',
        url: 'https://example.com',
        verificationToken: 'jovie-verify=abc123',
      },
    ]);
    const claimChain = buildSelectChain([]);
    const updateChain = buildUpdateChain();

    mockSelect.mockReturnValueOnce(linkChain).mockReturnValueOnce(claimChain);
    mockUpdate.mockReturnValueOnce(updateChain);

    mockResolveTxt.mockResolvedValueOnce([['unrelated-record']]);

    const req = createRequest({ profileId: 'profile-1', linkId: 'link-1' });
    await POST(req);

    expect(mockUpdate).toHaveBeenCalled();
    const setArg = updateChain.set.mock.calls[0][0];
    expect(setArg.verificationStatus).toBe('pending');
    expect(setArg.verifiedAt).toBeNull();
  });

  it('handles chunked TXT records correctly', async () => {
    const linkChain = buildSelectChain([
      {
        id: 'link-1',
        platform: 'website',
        url: 'https://example.com',
        verificationToken: 'jovie-verify=abc123',
      },
    ]);
    const claimChain = buildSelectChain([]);
    const updateChain = buildUpdateChain();

    mockSelect.mockReturnValueOnce(linkChain).mockReturnValueOnce(claimChain);
    mockUpdate.mockReturnValueOnce(updateChain);

    // DNS returns chunked record
    mockResolveTxt.mockResolvedValueOnce([['jovie-verify=', 'abc123']]);

    const req = createRequest({ profileId: 'profile-1', linkId: 'link-1' });
    const res = await POST(req);

    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.status).toBe('verified');
  });
});
