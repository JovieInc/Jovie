// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ sql: vi.fn() }));
vi.mock('@neondatabase/serverless', () => ({ neon: vi.fn(() => mocks.sql) }));
vi.mock('@/lib/leads/seed-keywords', () => ({
  FEATURE_FM_SEED_KEYWORDS: ['site:linktr.ee "rapper" spotify'],
}));
vi.mock('@/lib/leads/search-evidence', () => ({
  buildToolSearchQueries: () => ['site:linktr.ee "rapper" spotify'],
}));

import { main } from './enable-sample-lead-discovery';

const before = {
  id: 1,
  enabled: false,
  discovery_enabled: false,
  auto_ingest_enabled: false,
  daily_query_budget: 10,
  daily_send_cap: 5,
  max_per_hour: 5,
  ramp_mode: 'manual',
  guardrails_enabled: true,
  queries_used_today: 2,
};
const updated = {
  ...before,
  enabled: true,
  discovery_enabled: true,
  daily_query_budget: 100,
};
const keyword = { query: 'site:linktr.ee "rapper" spotify', enabled: true };
let write: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.stubEnv('DATABASE_URL', 'postgres://test.invalid/test');
  vi.stubEnv('FEATURE_INSTANTLY_OUTBOUND', 'false');
  mocks.sql.mockReset();
  write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function rows(...results: unknown[][]) {
  for (const result of results) mocks.sql.mockResolvedValueOnce(result);
}
function output() {
  return JSON.parse(String(write.mock.calls[0]?.[0]));
}

describe('lead discovery sample command', () => {
  it('defaults to a read-only preview', async () => {
    rows([before], [keyword]);
    await main([]);
    expect(mocks.sql).toHaveBeenCalledTimes(2);
    expect(output()).toMatchObject({
      apply: false,
      insertedKeywords: 0,
      before: { settings: before },
      after: { settings: before },
    });
  });
  it('applies only the approved settings and reads the result back', async () => {
    rows([before], [keyword], [updated], [updated], [keyword]);
    await main(['--apply']);
    const [sql, ...values] = mocks.sql.mock.calls[2];
    expect(sql.join('?')).toContain('UPDATE lead_pipeline_settings');
    expect(sql.join('?')).not.toContain('daily_send_cap =');
    expect(values).toEqual([true, true, 100, false, 1]);
    expect(output()).toMatchObject({
      apply: true,
      insertedKeywords: 0,
      after: { settings: updated },
    });
  });
  it('seeds only when no keywords are enabled and deduplicates the seed list', async () => {
    rows([before], [], [{ id: 1 }], [updated], [updated], [keyword]);
    await main(['--apply']);
    expect(
      mocks.sql.mock.calls.filter(([sql]) =>
        sql.join('').includes('INSERT INTO discovery_keywords')
      )
    ).toHaveLength(1);
    expect(output()).toMatchObject({
      insertedKeywords: 1,
      after: { musicArtistQueriesEnabled: true },
    });
  });
  it('refuses outbound, missing connection details and missing settings', async () => {
    vi.stubEnv('FEATURE_INSTANTLY_OUTBOUND', 'true');
    await expect(main(['--apply'])).rejects.toThrow(
      'Refusing to enable discovery'
    );
    vi.stubEnv('FEATURE_INSTANTLY_OUTBOUND', 'false');
    vi.stubEnv('DATABASE_URL', '');
    await expect(main([])).rejects.toThrow('DATABASE_URL is required');
    vi.stubEnv('DATABASE_URL', 'https://invalid');
    await expect(main([])).rejects.toThrow(
      'DATABASE_URL must be a postgres URL'
    );
    vi.stubEnv('DATABASE_URL', 'postgres://test.invalid/test');
    rows([], []);
    await expect(main([])).rejects.toThrow('does not exist');
  });
  it('rejects missing updates, changed send settings and missing artist queries', async () => {
    rows([before], [keyword], []);
    await expect(main(['--apply'])).rejects.toThrow('was not updated');
    mocks.sql.mockReset();
    rows(
      [before],
      [keyword],
      [{ ...updated, daily_send_cap: 6 }],
      [updated],
      [keyword]
    );
    await expect(main(['--apply'])).rejects.toThrow('Send columns changed');
    mocks.sql.mockReset();
    rows([before], [keyword], [updated], [updated], []);
    await expect(main(['--apply'])).rejects.toThrow('No enabled music-artist');
  });
});
