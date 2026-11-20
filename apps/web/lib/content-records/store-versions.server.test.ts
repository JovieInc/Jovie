import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MarketingPageSpec } from './marketing-page';

/**
 * The live-content cache has no expiry, so only real store answers may be
 * cached. A failed table probe or query must fall back per request and let the
 * next read retry.
 */
const mocks = vi.hoisted(() => ({
  table: vi.fn(),
  rows: vi.fn(),
  captureWarning: vi.fn(),
  atomicOperation: vi.fn(),
  // Mirrors the Data Cache: a returned value is stored with no expiry, a
  // thrown error is not stored.
  store: new Map<string, unknown>(),
}));

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({
  unstable_cache:
    (fn: () => Promise<unknown>, keyParts: string[]) => async () => {
      const key = keyParts.join(':');
      if (!mocks.store.has(key)) mocks.store.set(key, await fn());
      return mocks.store.get(key);
    },
}));
vi.mock('@/lib/db', () => {
  const builder: Record<string, unknown> = {};
  for (const method of ['from', 'innerJoin', 'where']) {
    builder[method] = () => builder;
  }
  builder.limit = () => mocks.rows();
  return { doesTableExist: mocks.table, db: { select: () => builder } };
});
vi.mock('@/lib/db/legacy-transaction', () => ({
  runAtomicDbOperation: mocks.atomicOperation,
}));
vi.mock('@/lib/error-tracking', () => ({
  captureWarning: mocks.captureWarning,
}));

const { getLiveContent } = await import('./store-versions.server');
const { MARKETING_PAGE_KIND, DEFAULT_HOME_SPEC } = await import(
  './marketing-page'
);

function liveRow() {
  return {
    versionId: 'v5',
    version: 5,
    data: DEFAULT_HOME_SPEC,
    schemaVersion: MARKETING_PAGE_KIND.schemaVersion,
    publishedAt: new Date('2026-10-28T01:00:00Z'),
  };
}

beforeEach(() => {
  mocks.table.mockReset().mockResolvedValue(true);
  mocks.rows.mockReset().mockResolvedValue([liveRow()]);
  mocks.captureWarning.mockReset();
  mocks.atomicOperation.mockReset();
  mocks.store.clear();
});

describe('read-time migration for a retired record (JOV-12824)', () => {
  it('serves the migrated record as live without the stale-record warning', async () => {
    mocks.rows.mockResolvedValue([
      {
        versionId: 'v4-old',
        version: 4,
        data: {
          sections: [
            {
              section: 'hero',
              variant: 'centered-handle-claim',
              copy: {
                headline: 'Find yourself.',
                subhead: 'Search your name.',
              },
            },
          ],
        },
        schemaVersion: MARKETING_PAGE_KIND.schemaVersion,
        publishedAt: new Date('2026-10-28T01:00:00Z'),
      },
    ]);
    const live = await getLiveContent(MARKETING_PAGE_KIND, 'home');
    expect(live.source).toBe('live');
    expect(live.versionId).toBe('v4-old');
    expect(live.data.sections.map(s => s.section)).toEqual([
      'hero',
      'feature-split',
      'product-gallery',
      'cta',
    ]);
    expect(mocks.captureWarning).not.toHaveBeenCalled();
  });

  it('warns and falls back when no migration recognizes the record', async () => {
    mocks.rows.mockResolvedValue([
      {
        versionId: 'v3-old',
        version: 3,
        data: { something: 'else entirely' },
        schemaVersion: MARKETING_PAGE_KIND.schemaVersion - 1,
        publishedAt: new Date('2026-10-28T01:00:00Z'),
      },
    ]);
    const live = await getLiveContent(MARKETING_PAGE_KIND, 'home');
    expect(live).toMatchObject({
      source: 'default',
      fallbackReason: 'incompatible',
    });
    expect(mocks.captureWarning).toHaveBeenCalledTimes(1);
  });
});

describe('read-time migration integrity', () => {
  it.each([-1, 1])(
    'does not use a migration to accept unsupported stored revision offset %i',
    async offset => {
      const migrate = vi.fn(() => DEFAULT_HOME_SPEC);
      mocks.rows.mockResolvedValue([
        {
          ...liveRow(),
          schemaVersion: MARKETING_PAGE_KIND.schemaVersion + offset,
        },
      ]);
      const live = await getLiveContent(
        { ...MARKETING_PAGE_KIND, migrate },
        'home'
      );
      expect(live).toMatchObject({
        source: 'default',
        versionId: null,
        fallbackReason: 'incompatible',
      });
      expect(migrate).not.toHaveBeenCalled();
      expect(mocks.captureWarning).toHaveBeenCalledTimes(1);
    }
  );

  it('keeps an unsupported new renderer revision incompatible', async () => {
    const migrate = vi.fn(() => DEFAULT_HOME_SPEC);
    const live = await getLiveContent(
      {
        ...MARKETING_PAGE_KIND,
        schemaVersion: MARKETING_PAGE_KIND.schemaVersion + 1,
        migrate,
      },
      'home'
    );
    expect(live).toMatchObject({
      source: 'default',
      versionId: null,
      fallbackReason: 'incompatible',
    });
    expect(migrate).not.toHaveBeenCalled();
  });

  it('preserves current published content and experiment without migration', async () => {
    const data = structuredClone(DEFAULT_HOME_SPEC);
    data.experiment = {
      id: 'home-copy',
      hypothesis: 'A different profile headline increases claim completions.',
      metric: { funnel: 'artist_signup', step: 'claim_complete' },
      status: 'running',
      variants: [
        { id: 'alternate', weight: 25, body: structuredClone(data.sections) },
      ],
    };
    const original = structuredClone(data);
    const migrate = vi.fn(() => DEFAULT_HOME_SPEC);
    mocks.rows.mockResolvedValue([{ ...liveRow(), data }]);
    const live = await getLiveContent(
      { ...MARKETING_PAGE_KIND, migrate },
      'home'
    );
    expect(live).toEqual({
      data: original,
      source: 'live',
      versionId: 'v5',
      version: 5,
      publishedAt: '2026-10-28T01:00:00.000Z',
    });
    expect(data).toEqual(original);
    expect(migrate).not.toHaveBeenCalled();
    expect(mocks.captureWarning).not.toHaveBeenCalled();
    expect(mocks.atomicOperation).not.toHaveBeenCalled();
  });

  it('migrates repeated cached reads without changing raw content or selected version', async () => {
    const data = structuredClone(DEFAULT_HOME_SPEC) as unknown as {
      sections: { variant: string }[];
    };
    data.sections[0]!.variant = 'centered-none';
    const original = structuredClone(data);
    mocks.rows.mockResolvedValueOnce([{ ...liveRow(), data }]);
    mocks.rows.mockResolvedValue([
      { ...liveRow(), versionId: 'v6', version: 6 },
    ]);
    for (let read = 0; read < 2; read++) {
      expect(await getLiveContent(MARKETING_PAGE_KIND, 'home')).toEqual({
        data: DEFAULT_HOME_SPEC,
        source: 'live',
        versionId: 'v5',
        version: 5,
        publishedAt: '2026-10-28T01:00:00.000Z',
      });
      expect(data).toEqual(original);
    }
    expect(mocks.rows).toHaveBeenCalledTimes(1);
    expect(mocks.captureWarning).not.toHaveBeenCalled();
    expect(mocks.atomicOperation).not.toHaveBeenCalled();
  });

  it.each([
    ['unrecognized', (): null => null],
    [
      'schema-invalid',
      (): MarketingPageSpec => ({ ...DEFAULT_HOME_SPEC, sections: [] }),
    ],
    [
      'rule-invalid',
      (): MarketingPageSpec => ({
        ...DEFAULT_HOME_SPEC,
        sections: [
          ...DEFAULT_HOME_SPEC.sections,
          DEFAULT_HOME_SPEC.sections[0]!,
        ],
      }),
    ],
    [
      'throwing',
      (): never => {
        throw new Error('migration failed');
      },
    ],
  ] as const)('falls back when the migration is %s', async (_name, migrate) => {
    mocks.rows.mockResolvedValue([{ ...liveRow(), data: { retired: true } }]);
    await expect(
      getLiveContent({ ...MARKETING_PAGE_KIND, migrate }, 'home')
    ).resolves.toMatchObject({
      source: 'default',
      versionId: null,
      fallbackReason: 'incompatible',
    });
    expect(mocks.captureWarning).toHaveBeenCalledTimes(1);
    expect(mocks.atomicOperation).not.toHaveBeenCalled();
  });

  it('does not migrate or publish a missing record', async () => {
    const migrate = vi.fn(() => DEFAULT_HOME_SPEC);
    mocks.rows.mockResolvedValue([]);
    expect(
      await getLiveContent({ ...MARKETING_PAGE_KIND, migrate }, 'home')
    ).toMatchObject({
      source: 'default',
      versionId: null,
      fallbackReason: 'unpublished',
    });
    expect(migrate).not.toHaveBeenCalled();
    expect(mocks.captureWarning).not.toHaveBeenCalled();
    expect(mocks.atomicOperation).not.toHaveBeenCalled();
  });
});

describe('live content cache correctness', () => {
  it('does not cache the default when the table probe fails transiently', async () => {
    mocks.table.mockResolvedValueOnce(false);
    const first = await getLiveContent(MARKETING_PAGE_KIND, 'home');
    expect(first).toMatchObject({
      source: 'default',
      fallbackReason: 'unavailable',
    });
    expect(mocks.rows).not.toHaveBeenCalled();

    const second = await getLiveContent(MARKETING_PAGE_KIND, 'home');
    expect(second).toMatchObject({ source: 'live', versionId: 'v5' });
  });

  it('does not cache the default when the query fails', async () => {
    mocks.rows.mockRejectedValueOnce(new Error('db down'));
    const first = await getLiveContent(MARKETING_PAGE_KIND, 'home');
    expect(first).toMatchObject({
      source: 'default',
      fallbackReason: 'unavailable',
    });
    expect(mocks.captureWarning).toHaveBeenCalledTimes(1);

    const second = await getLiveContent(MARKETING_PAGE_KIND, 'home');
    expect(second).toMatchObject({ source: 'live', versionId: 'v5' });
  });

  it('caches real answers, including "nothing published"', async () => {
    mocks.rows.mockResolvedValue([]);
    for (let read = 0; read < 2; read++) {
      expect(await getLiveContent(MARKETING_PAGE_KIND, 'home')).toMatchObject({
        source: 'default',
        fallbackReason: 'unpublished',
      });
    }
    expect(mocks.rows).toHaveBeenCalledTimes(1);
  });
});
