// @vitest-environment node
/**
 * Probe traffic must not count in any funnel (prod: ~22k probe journeys vs
 * ~100-240 real visits a day). Runs the real funnel SQL on PGlite.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { sql as drizzleSql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const holder = vi.hoisted(() => ({ db: null as unknown }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/db', () => ({
  get db() {
    return holder.db;
  },
}));
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }));

import { getArtistOfferFunnelReport } from '@/lib/acquisition/artist-offer-funnel.server';
import {
  isSyntheticTraffic,
  SYNTHETIC_TRAFFIC_HEADER,
} from '@/lib/acquisition/synthetic-traffic';

let client: PGlite;
const db = () => holder.db as ReturnType<typeof drizzle>;

beforeAll(async () => {
  client = new PGlite();
  const dir = path.join(process.cwd(), 'drizzle', 'migrations');
  const journal = JSON.parse(
    readFileSync(path.join(dir, 'meta', '_journal.json'), 'utf8')
  );
  for (const entry of journal.entries) {
    await client.exec(
      readFileSync(
        path.join(dir, `${entry.tag}.drizzleSql`),
        'utf8'
      ).replaceAll('--> statement-breakpoint', '')
    );
  }
  holder.db = drizzle(client);
}, 280_000);

afterAll(async () => client.close());

describe('isSyntheticTraffic', () => {
  const h = (init: Record<string, string>) => new Headers(init);
  it('recognises the synthetic monitor header and automation user agents', () => {
    expect(isSyntheticTraffic(h({ [SYNTHETIC_TRAFFIC_HEADER]: 'true' }))).toBe(
      true
    );
    expect(
      isSyntheticTraffic(
        h({ 'user-agent': 'Jovie-SyntheticMonitoring/1.0 (Playwright)' })
      )
    ).toBe(true);
    expect(
      isSyntheticTraffic(h({ 'user-agent': 'Mozilla/5.0 HeadlessChrome/120' }))
    ).toBe(true);
    expect(isSyntheticTraffic(h({ 'user-agent': 'Googlebot/2.1' }))).toBe(true);
  });
  it('keeps real browsers', () => {
    expect(
      isSyntheticTraffic(
        h({
          'user-agent':
            'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit/605.1.15 Safari/604.1',
        })
      )
    ).toBe(false);
    expect(isSyntheticTraffic(h({}))).toBe(false);
  });
});

describe('funnel excludes synthetic traffic', () => {
  const now = new Date();
  const journey = (id: string, firstTouch: object) =>
    db().execute(drizzleSql`
      INSERT INTO acquisition_journeys (id, first_touch, consent_state, captured_at)
      VALUES (${id}::uuid, ${JSON.stringify(firstTouch)}::jsonb, 'analytics_allowed', ${now})
    `);
  const stage = (id: string, name: string) =>
    db().execute(drizzleSql`
      INSERT INTO acquisition_journey_stages (acquisition_id, stage, occurred_at)
      VALUES (${id}::uuid, ${name}, ${now})
    `);

  it('counts only the real journey, in visits, cohort stages and events', async () => {
    const REAL = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const TAGGED = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const FIXTURE = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    await journey(REAL, { landingPath: '/pricing' });
    await journey(TAGGED, { landingPath: '/pricing', synthetic: true });
    await journey(FIXTURE, { landingPath: '/dualipa?mode=tour' });
    for (const id of [REAL, TAGGED, FIXTURE]) await stage(id, 'pricing');

    const report = await getArtistOfferFunnelReport({
      start: new Date(now.getTime() - 3_600_000),
      end: new Date(now.getTime() + 3_600_000),
    });
    const visit = report.stages.find(s => s.stage === 'visit');
    const pricing = report.stages.find(s => s.stage === 'pricing');
    expect(visit?.journeys).toBe(1);
    expect(pricing?.journeys).toBe(1);
    expect(report.diagnostics.stageEventsInWindow.pricing).toBe(1);
  });
});
