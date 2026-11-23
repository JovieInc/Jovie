// @vitest-environment node
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { PGlite } from '@electric-sql/pglite';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { CRAWL_CONTENT_FIXTURE } from './crawl-content-fixture';

const harness = vi.hoisted(() => ({ client: null as PGlite | null }));

// Real PostgreSQL with the production migrations; no production DB.
vi.mock('@/lib/db', async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const { drizzle } = await import('drizzle-orm/pglite');
  const client = new PGlite();
  harness.client = client;
  return { db: drizzle(client) };
});

const { reconcileCrawlContentFixture, readCrawlContentFixtureState } =
  await import('./crawl-content-fixture.server');

const f = CRAWL_CONTENT_FIXTURE;
const client = () => harness.client as PGlite;

beforeAll(async () => {
  const dir = path.join(process.cwd(), 'drizzle', 'migrations');
  const journal = JSON.parse(
    readFileSync(path.join(dir, 'meta', '_journal.json'), 'utf8')
  ) as { entries: { tag: string }[] };
  for (const { tag } of journal.entries) {
    await client().exec(
      readFileSync(path.join(dir, `${tag}.sql`), 'utf8').replaceAll(
        '--> statement-breakpoint',
        ''
      )
    );
  }
}, 120_000);

afterAll(async () => harness.client?.close());

beforeEach(async () => {
  await client().exec(
    'TRUNCATE users, creator_profiles, discog_releases, merch_cards, promo_downloads CASCADE'
  );
});

const actions = (steps: { name: string; action: string }[]) =>
  steps.map(s => `${s.name}:${s.action}`);

describe('crawl content fixture reconciler (real Postgres)', () => {
  it('dry run plans every row and writes nothing', async () => {
    const result = await reconcileCrawlContentFixture({ apply: false });
    expect(result.converged).toBe(false);
    expect(result.steps.every(s => s.action === 'create')).toBe(true);
    const { rows } = await client().query<{ n: number }>(
      'SELECT count(*)::int AS n FROM users'
    );
    expect(rows[0].n).toBe(0);
  });

  it('apply converges, and a second pass has nothing to do', async () => {
    const first = await reconcileCrawlContentFixture({ apply: true });
    expect(first.converged).toBe(true);

    const second = await reconcileCrawlContentFixture({ apply: false });
    expect(second.converged).toBe(true);
    expect(second.steps.every(s => s.action === 'none')).toBe(true);

    const again = await reconcileCrawlContentFixture({ apply: true });
    expect(again.converged).toBe(true);

    const { rows } = await client().query<{
      is_public: boolean;
      settings: { searchable?: boolean };
      plan: string;
    }>(
      `SELECT p.is_public, p.settings, u.plan
         FROM creator_profiles p JOIN users u ON u.id = p.user_id
        WHERE p.username_normalized = $1`,
      [f.handle]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      is_public: true,
      settings: { searchable: false },
      plan: 'pro',
    });
  });

  it('converges rows that drifted from what the pages need', async () => {
    await reconcileCrawlContentFixture({ apply: true });
    await client().query(
      "UPDATE merch_cards SET status = 'paused' WHERE id = $1",
      [f.merchCard.id]
    );
    await client().query(
      'UPDATE promo_downloads SET is_active = false WHERE id = $1',
      [f.promoDownload.id]
    );

    const drifted = await reconcileCrawlContentFixture({ apply: false });
    expect(actions(drifted.steps)).toEqual(
      expect.arrayContaining(['promo-download:converge', 'merch-card:converge'])
    );

    const healed = await reconcileCrawlContentFixture({ apply: true });
    expect(healed.converged).toBe(true);
    const state = await readCrawlContentFixtureState();
    expect(state.merchCard?.status).toBe('live');
    expect(state.promoDownload?.isActive).toBe(true);
  });

  it('refuses the handle when another user owns it, before any write', async () => {
    await client().query(
      `INSERT INTO users (clerk_id, email, user_status) VALUES ('someone_else', 'someone@example.com', 'active')`
    );
    await client().query(
      `INSERT INTO creator_profiles (user_id, creator_type, username, username_normalized, display_name)
       SELECT id, 'artist', $1, $1, 'Someone' FROM users WHERE clerk_id = 'someone_else'`,
      [f.handle]
    );

    await expect(
      reconcileCrawlContentFixture({ apply: true })
    ).rejects.toThrow();
    const { rows } = await client().query<{ n: number }>(
      'SELECT count(*)::int AS n FROM users WHERE email = $1',
      [f.email]
    );
    expect(rows[0].n).toBe(0);
    const merch = await client().query('SELECT 1 FROM merch_cards');
    expect(merch.rows).toHaveLength(0);
  });

  it('uses only the fixture identity', async () => {
    await reconcileCrawlContentFixture({ apply: true });
    const { rows } = await client().query<{ email: string }>(
      'SELECT email FROM users'
    );
    expect(rows.map(r => r.email)).toEqual([f.email]);
  });
});
