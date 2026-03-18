import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

// --- Hoisted mock variables (available inside vi.mock factories) ---

const {
  mockSetWhere,
  mockDb,
  mockGenerateClaimTokenPair,
  mockFilterEmail,
  mockDetectRepresentation,
} = vi.hoisted(() => {
  const mockSelectWhere = vi.fn();
  const mockSetWhere = vi.fn();
  const mockSet = vi.fn().mockReturnValue({ where: mockSetWhere });
  const mockUpdate = vi.fn().mockReturnValue({ set: mockSet });

  const mockDb = {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: mockSelectWhere,
      }),
    }),
    update: mockUpdate,
  };

  const mockGenerateClaimTokenPair = vi.fn();
  const mockFilterEmail = vi.fn();
  const mockDetectRepresentation = vi.fn();

  return {
    mockSetWhere,
    mockDb,
    mockGenerateClaimTokenPair,
    mockFilterEmail,
    mockDetectRepresentation,
  };
});

// --- Module mocks ---

vi.mock('@/lib/db', () => ({ db: mockDb }));

vi.mock('@/lib/db/schema/leads', () => ({
  leads: { id: 'leads.id' },
  leadPipelineSettings: { id: 'leadPipelineSettings.id' },
}));

vi.mock('@/lib/security/claim-token', () => ({
  generateClaimTokenPair: mockGenerateClaimTokenPair,
}));

vi.mock('@/lib/leads/email-filter', () => ({
  filterEmail: mockFilterEmail,
}));

vi.mock('@/lib/leads/management-filter', () => ({
  detectRepresentation: mockDetectRepresentation,
}));

vi.mock('@/lib/leads/pipeline-logger', () => ({
  pipelineLog: vi.fn(),
  pipelineWarn: vi.fn(),
}));

vi.mock('@/constants/domains', () => ({
  getAppUrl: (path: string) => `https://jov.ie${path}`,
}));

import { routeLead } from '@/lib/leads/route-lead';

// --- Helpers ---

const baseLead = {
  id: 'lead-1',
  contactEmail: 'artist@gmail.com',
  bio: 'I make music',
  hasInstagram: true,
  instagramHandle: 'artist',
  spotifyFollowers: 1000,
  spotifyPopularity: 30,
  claimToken: null,
  claimTokenHash: null,
  claimTokenExpiresAt: null,
  displayName: 'Test Artist',
  linktreeHandle: 'testartist',
};

const futureDate = new Date();
futureDate.setDate(futureDate.getDate() + 10);

const pastDate = new Date();
pastDate.setDate(pastDate.getDate() - 10);

const freshTokenPair = {
  token: 'new-token-123',
  tokenHash: 'new-hash-123',
  expiresAt: futureDate,
};

function setupLead(overrides: Record<string, unknown> = {}) {
  const lead = { ...baseLead, ...overrides };

  // Reset select chain — where() is called for both lead fetch and settings fetch
  const whereForSelect = vi.fn();
  const fromForSelect = vi.fn().mockReturnValue({ where: whereForSelect });
  mockDb.select.mockReturnValue({ from: fromForSelect });

  // First call returns the lead, second call returns pipeline settings
  let selectCallCount = 0;
  whereForSelect.mockImplementation(() => {
    selectCallCount++;
    if (selectCallCount === 1) return Promise.resolve([lead]);
    // pipeline settings
    return Promise.resolve([{ dmTemplate: null }]);
  });

  // Reset update chain
  mockSetWhere.mockResolvedValue(undefined);

  return lead;
}

describe('routeLead', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockGenerateClaimTokenPair.mockResolvedValue(freshTokenPair);

    mockFilterEmail.mockReturnValue({
      invalid: false,
      suspicious: false,
      reason: null,
    });

    mockDetectRepresentation.mockReturnValue({
      hasRepresentation: false,
      signal: null,
    });
  });

  it('routes "both" when email is valid and Instagram is present', async () => {
    setupLead();

    const result = await routeLead('lead-1');

    expect(result.route).toBe('both');
    expect(result.claimUrl).toBe('https://jov.ie/claim/new-token-123');
    expect(result.dmCopy).toContain('Test Artist');
  });

  it('routes "email" when email is valid but no Instagram', async () => {
    setupLead({ hasInstagram: false });

    const result = await routeLead('lead-1');

    expect(result.route).toBe('email');
    expect(result.dmCopy).toBeNull();
  });

  it('routes "dm" when email is invalid but Instagram is present', async () => {
    setupLead();
    mockFilterEmail.mockReturnValue({
      invalid: true,
      suspicious: false,
      reason: 'Disposable email domain',
    });

    const result = await routeLead('lead-1');

    expect(result.route).toBe('dm');
    expect(result.dmCopy).toContain('Test Artist');
  });

  it('routes "skipped" when email is invalid and no Instagram', async () => {
    setupLead({ hasInstagram: false });
    mockFilterEmail.mockReturnValue({
      invalid: true,
      suspicious: false,
      reason: 'Disposable email domain',
    });

    const result = await routeLead('lead-1');

    expect(result.route).toBe('skipped');
    expect(result.dmCopy).toBeNull();
  });

  it('routes "manual_review" for high-profile artists (>50k followers)', async () => {
    setupLead({ spotifyFollowers: 60000 });

    const result = await routeLead('lead-1');

    expect(result.route).toBe('manual_review');
  });

  it('routes "manual_review" when representation is detected', async () => {
    setupLead();
    mockDetectRepresentation.mockReturnValue({
      hasRepresentation: true,
      signal: 'Email prefix: booking@',
    });

    const result = await routeLead('lead-1');

    expect(result.route).toBe('manual_review');
  });

  it('generates a new token when existing token is expired', async () => {
    setupLead({
      claimToken: 'old-token',
      claimTokenHash: 'old-hash',
      claimTokenExpiresAt: pastDate,
    });

    const result = await routeLead('lead-1');

    expect(mockGenerateClaimTokenPair).toHaveBeenCalledOnce();
    expect(result.claimUrl).toBe('https://jov.ie/claim/new-token-123');
  });

  it('reuses an existing valid claim token', async () => {
    setupLead({
      claimToken: 'existing-token',
      claimTokenHash: 'existing-hash',
      claimTokenExpiresAt: futureDate,
    });

    const result = await routeLead('lead-1');

    expect(mockGenerateClaimTokenPair).not.toHaveBeenCalled();
    expect(result.claimUrl).toBe('https://jov.ie/claim/existing-token');
  });
});
