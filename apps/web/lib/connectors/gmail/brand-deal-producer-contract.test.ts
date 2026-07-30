import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const readConnectorSource = (relativePath: string) =>
  readFileSync(new URL(relativePath, import.meta.url), 'utf8');

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  loadDecryptedToken: vi.fn(),
  buildGmailOpportunityQuery: vi.fn(),
  listGmailMessages: vi.fn(),
  runConnectorEnrichment: vi.fn(),
}));

let selectResults: readonly unknown[][] = [];

vi.mock('@/lib/db', () => ({
  db: {
    select: mocks.select,
    insert: vi.fn(),
  },
}));
vi.mock('@/lib/connectors/token-vault', () => ({
  loadDecryptedToken: mocks.loadDecryptedToken,
}));
vi.mock('@/lib/connectors/gmail/client', () => ({
  buildGmailOpportunityQuery: mocks.buildGmailOpportunityQuery,
  getGmailMessage: vi.fn(),
  getHeader: vi.fn(),
  listGmailMessages: mocks.listGmailMessages,
}));
vi.mock('@/lib/connectors/enrichment', () => ({
  runConnectorEnrichment: mocks.runConnectorEnrichment,
}));
vi.mock('@/lib/env-server', () => ({
  env: { GMAIL_HISTORY_WINDOW_DAYS: undefined },
}));
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }));
vi.mock('@/lib/utils/logger', () => ({
  logger: { error: vi.fn(), info: vi.fn() },
}));

import { resolveConnectorEnrichmentContext } from '../enrichment/scope';
import { extractAndPropose } from '../extract-and-propose';

function queueSelectResults(...results: readonly unknown[][]) {
  selectResults = results;
  mocks.select.mockImplementation(() => {
    const rows = selectResults[0] ?? [];
    selectResults = selectResults.slice(1);
    return {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockResolvedValue(rows),
      limit: vi.fn().mockResolvedValue(rows),
      then: (
        onFulfilled?: (value: readonly unknown[]) => unknown,
        onRejected?: (reason: unknown) => unknown
      ) => Promise.resolve(rows).then(onFulfilled, onRejected),
    };
  });
}

describe('native Gmail brand-deal producer contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectResults = [];
    mocks.loadDecryptedToken.mockResolvedValue({ accessToken: 'token' });
    mocks.buildGmailOpportunityQuery.mockReturnValue('query');
    mocks.listGmailMessages.mockResolvedValue({
      messages: [],
      resultSizeEstimate: 0,
    });
    mocks.runConnectorEnrichment.mockResolvedValue({
      pipelines: [],
      totalSuggestionsCreated: 1,
    });
  });

  it('keeps Gmail retrieval read-only and metadata-scoped', () => {
    const source = readConnectorSource('./client.ts');
    expect(source).toContain("format: 'metadata'");
    expect(source).not.toContain("format: 'full'");
    expect(source).toContain('"paid creator campaign"');
  });

  it('passes only persisted evidence identity into the trusted emitter', () => {
    const pipeline = readConnectorSource('../enrichment/pipelines/gmail.ts');
    const emitter = readConnectorSource('../brand-deal-opportunity-emitter.ts');
    expect(pipeline).toContain('selectHighestRankedGmailBrandDealCandidate');
    expect(pipeline).toContain(
      'evidenceObjectId: brandDealCandidate.evidenceObjectId'
    );
    expect(pipeline).not.toContain('candidate: brandDealCandidate.candidate');
    expect(emitter).toContain('payload: externalObjects.payload');
    expect(emitter).not.toMatch(/readonly candidate:/);
  });

  it.each([
    {
      label: 'Tim exact account',
      accounts: [
        { id: 'other', providerAccountId: 'tim@jov.ie' },
        { id: 'tim', providerAccountId: ' T@timwhite.co ' },
      ],
      expected: 'tim',
    },
    {
      label: 'generic user account',
      accounts: [{ id: 'generic', providerAccountId: 'creator@example.com' }],
      expected: 'generic',
    },
  ])('routes enrichment through the $label', async ({ accounts, expected }) => {
    queueSelectResults(accounts);

    await expect(extractAndPropose('user-1')).resolves.toBe(1);

    expect(mocks.loadDecryptedToken).toHaveBeenCalledWith(expected);
    expect(mocks.runConnectorEnrichment).toHaveBeenCalledWith('user-1', {
      gmailAccountId: expected,
    });
  });

  it('does not run enrichment without a connected Gmail account', async () => {
    queueSelectResults([]);

    await expect(extractAndPropose('user-2')).resolves.toBe(0);

    expect(mocks.loadDecryptedToken).not.toHaveBeenCalled();
    expect(mocks.runConnectorEnrichment).not.toHaveBeenCalled();
  });

  it('keeps the explicit Gmail account through enrichment scope resolution', async () => {
    queueSelectResults([
      {
        id: 'gmail-other',
        provider: 'gmail',
        creatorProfileId: 'profile-other',
      },
      {
        id: 'gmail-tim',
        provider: 'gmail',
        creatorProfileId: 'profile-tim',
      },
      {
        id: 'calendar',
        provider: 'google_calendar',
        creatorProfileId: 'profile-calendar',
      },
    ]);

    await expect(
      resolveConnectorEnrichmentContext('user-3', {
        gmailAccountId: 'gmail-tim',
      })
    ).resolves.toEqual({
      scope: { userId: 'user-3', creatorProfileId: 'profile-tim' },
      gmailAccountId: 'gmail-tim',
      calendarAccountId: 'calendar',
    });
  });
});
