import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { teardownGoldenPathRun } from '../../e2e/helpers/claim-dogfood-fixtures';

// One Neon branch per CI run is shared by every lane that lists
// golden-path.spec.ts (E2E Smoke, Extended Smoke, Golden Path). The smoke
// lanes skip the journey under the auth bypass, but a database-wide teardown
// in their afterAll still cleared the live Golden Path claim's spotify_id
// mid-journey (run 44989864792: Extended Smoke started golden-path.spec.ts at
// 05:44:46.37, Golden Path read spotifyArtistId null at 05:44:47.04).

type Query = { text: string; values: unknown[] };

function fakeSql() {
  const queries: Query[] = [];
  const sql = vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => {
    queries.push({ text: strings.join('?'), values });
    return Promise.resolve([]);
  });
  return { queries, sql };
}

describe('Golden Path teardown scope', () => {
  it('touches nothing when this run created no identity', async () => {
    const { queries, sql } = fakeSql();
    await teardownGoldenPathRun(
      sql as unknown as Parameters<typeof teardownGoldenPathRun>[0],
      []
    );
    expect(queries).toEqual([]);
  });

  it('releases and unpublishes only the identities this run created', async () => {
    const { queries, sql } = fakeSql();
    const emails = ['gp-abc+e2e@test.jovie.com'];
    await teardownGoldenPathRun(
      sql as unknown as Parameters<typeof teardownGoldenPathRun>[0],
      emails
    );
    expect(queries).toHaveLength(1);
    const [query] = queries;
    expect(query?.text).toContain('spotify_id = NULL');
    expect(query?.text).toContain('is_public = false');
    expect(query?.text).toContain('email = ANY(');
    expect(query?.text).not.toMatch(/\bLIKE\b/i);
    expect(query?.values).toEqual([emails]);
  });

  it('golden-path.spec.ts teardown is scoped to its own run', () => {
    const spec = readFileSync(
      resolve(__dirname, '../../e2e/golden-path.spec.ts'),
      'utf8'
    );
    const afterAll = spec.match(/test\.afterAll\([\s\S]*?\n {2}\}\);/)?.[0];
    expect(afterAll, 'golden-path.spec.ts afterAll').toBeTruthy();
    expect(afterAll).toContain('teardownGoldenPathRun(');
    expect(afterAll).not.toContain('releaseGoldenPathTestBindings(');
    expect(afterAll).not.toContain('unpublishGoldenPathTestProfiles(');
    // Every generated journey identity is recorded for teardown.
    expect(spec).toMatch(
      /const email = `gp-\$\{Date\.now\(\)\.toString\(36\)\}\+e2e@test\.jovie\.com`;\n\s*GOLDEN_PATH_RUN_EMAILS\.add\(email\);/
    );
  });
});
