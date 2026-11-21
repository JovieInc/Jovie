import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  partner: vi.fn(),
  available: vi.fn(),
  bound: vi.fn(),
  albums: vi.fn(),
  library: vi.fn(),
  flag: vi.fn(),
  results: [] as unknown[][],
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/release-to-revenue/design-partner-config', () => ({
  resolveDesignPartnerConfig: h.partner,
}));
vi.mock('@/lib/release-to-revenue/autostart', () => ({
  AUTOPILOT_CYCLE_DAYS: 28,
}));
vi.mock('@/lib/dsp-enrichment/providers/apple-music', () => ({
  isAppleMusicAvailable: h.available,
  getArtistAlbums: h.albums,
}));
vi.mock('@/lib/dsp-enrichment/apple-music-target', () => ({
  getBoundAppleMusicArtistId: h.bound,
}));
vi.mock('@/lib/discography/apple-music-import', () => ({
  loadLibrary: h.library,
}));
vi.mock('@/lib/flags/server', () => ({ getAppFlagValue: h.flag }));

// Every select chain resolves to the next queued result, wherever it ends.
const chain = (): unknown => {
  const next = () => Promise.resolve(h.results.shift() ?? []);
  const node: Record<string, unknown> = {};
  for (const step of ['from', 'where', 'orderBy', 'limit'])
    node[step] = () => node;
  node.then = (ok: (v: unknown) => unknown, bad: (e: unknown) => unknown) =>
    next().then(ok, bad);
  return node;
};
vi.mock('@/lib/db', () => ({ db: { select: () => chain() } }));

import { checkDesignPartnerAccountTruth } from './account-truth';

const now = new Date('2026-11-21T06:00:00Z');
const album = (id: string, name: string) => ({
  id,
  type: 'albums',
  attributes: { name, artistName: 'Tim White', upc: null, url: 'u' },
});
const keys = (r: { findings: readonly { key: string }[] }) =>
  r.findings.map(f => f.key);

beforeEach(() => {
  vi.clearAllMocks();
  h.results = [];
  h.partner.mockResolvedValue({
    creatorUsername: 'tim',
    creatorProfileId: 'p1',
    userId: 'u1',
  });
  h.available.mockReturnValue(true);
  h.bound.mockResolvedValue('859547284');
  h.flag.mockResolvedValue(true);
});

describe('checkDesignPartnerAccountTruth', () => {
  it('flags Library rows the public profile hides, with the reason', async () => {
    h.albums.mockResolvedValue([
      album('1', 'All This Noise - EP'),
      album('2', 'Seaside Heights - Single'),
    ]);
    h.library.mockResolvedValue([
      { id: 'r1', title: 'All This Noise', upc: null, appleAlbumIds: ['1'] },
      { id: 'r2', title: 'Seaside Heights', upc: null, appleAlbumIds: [] },
    ]);
    h.results = [
      [{ status: 'completed', error: null, missingCount: 0, createdAt: now }],
      [
        {
          id: 'r1',
          eligible: false,
          deletedAt: null,
          status: 'released',
          releaseDate: now,
          artworkUrl: 'a',
        },
        {
          id: 'r2',
          eligible: true,
          deletedAt: null,
          status: 'released',
          releaseDate: now,
          artworkUrl: 'a',
        },
      ],
      [],
      [{ id: 'run1', status: 'running', createdAt: now }],
    ];
    const report = await checkDesignPartnerAccountTruth(now);
    expect(keys(report)).toEqual(['dogfood-catalog-hidden']);
    expect(report.findings[0].evidence).toEqual({
      releases: [{ title: 'All This Noise', reasons: ['no-approval-row'] }],
    });
    expect(report.ok).toBe(false);
  });

  it('respects a release the artist hid on purpose', async () => {
    h.albums.mockResolvedValue([album('1', 'All This Noise - EP')]);
    h.library.mockResolvedValue([
      { id: 'r1', title: 'All This Noise', upc: null, appleAlbumIds: ['1'] },
    ]);
    h.results = [
      [{ status: 'completed', error: null, missingCount: 0, createdAt: now }],
      [
        {
          id: 'r1',
          eligible: false,
          deletedAt: null,
          status: 'released',
          releaseDate: now,
          artworkUrl: 'a',
        },
      ],
      [
        {
          assetId: 'r1',
          approvalStatus: 'approved',
          profileVisibility: 'hidden',
        },
      ],
      [{ id: 'run1', status: 'completed', createdAt: now }],
    ];
    const report = await checkDesignPartnerAccountTruth(now);
    expect(report).toMatchObject({ ok: true, findings: [] });
  });

  it('flags missing albums, a stale scan and no cycle', async () => {
    h.albums.mockResolvedValue([album('3', "Don't Let Go - Single")]);
    h.library.mockResolvedValue([]);
    const old = new Date('2026-11-01T00:00:00Z');
    h.results = [
      [
        {
          status: 'failed',
          error: 'no_authority',
          missingCount: 0,
          createdAt: old,
        },
      ],
      [],
      [{ title: 'Never Say A Word' }],
    ];
    const report = await checkDesignPartnerAccountTruth(now);
    expect(keys(report)).toEqual([
      'dogfood-apple-scan-stale',
      'dogfood-catalog-missing',
      'dogfood-cycle-not-running',
    ]);
    expect(report.findings[2].evidence).toEqual({
      flagEnabled: true,
      focusRelease: 'Never Say A Word',
    });
  });

  it('stops at an unbound Apple artist and still checks the cycle', async () => {
    h.bound.mockResolvedValue(null);
    h.results = [
      [
        {
          id: 'run1',
          status: 'failed',
          error: 'boom',
          currentStep: 'draft',
          createdAt: now,
        },
      ],
    ];
    const report = await checkDesignPartnerAccountTruth(now);
    expect(keys(report)).toEqual([
      'dogfood-apple-unbound',
      'dogfood-cycle-failed',
    ]);
    expect(h.albums).not.toHaveBeenCalled();
  });

  it('reports a design partner that does not resolve', async () => {
    h.partner.mockResolvedValue(null);
    const report = await checkDesignPartnerAccountTruth(now);
    expect(keys(report)).toEqual(['dogfood-design-partner-missing']);
  });
});
