// @vitest-environment node
import { execFileSync, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { aggregateRevenue } from '@/lib/services/insights/data-aggregator';

const { execute } = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock('@/lib/db', () => ({ db: { execute } }));
vi.mock('@/lib/db/query-timeout', () => ({
  dashboardQuery: (query: () => Promise<unknown>) => query(),
}));

// The connection boundary is replaced, but Drizzle's real query and the service's
// result mapping execute against isolated PostgreSQL. No DATABASE_URL is used.
// Uses the existing integration selector; PostgreSQL tools are required, not skipped.
const profile = '00000000-0000-4000-8000-000000000100';
const otherProfile = '00000000-0000-4000-8000-000000000101';
const fan1 = '00000000-0000-4000-8000-000000000001';
const fan2 = '00000000-0000-4000-8000-000000000002';
const period = { start: new Date('2026-01-01Z'), end: new Date('2026-02-01Z') };
const previous = { start: new Date('2025-12-01Z'), end: period.start };
const dialect = new PgDialect();
let temporary: string;
let data: string;
let binaries: string;

function literal(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw new Error('Unexpected fixture SQL parameter');
  }
  return `'${String(value).replaceAll("'", "''")}'`;
}

function runSql(sql: string) {
  const result = spawnSync(
    join(binaries, 'postgres'),
    ['--single', '-D', data, '-c', 'shared_buffers=16MB', '-j', 'postgres'],
    { input: sql, encoding: 'utf8', timeout: 30_000 }
  );
  if (
    result.error ||
    result.status !== 0 ||
    /\b(?:ERROR|FATAL):/.test(result.stderr)
  ) {
    throw new Error(result.error?.message ?? result.stderr);
  }
}

beforeAll(() => {
  // pg_config resolves server tools on macOS and Linux; JOVIE_TEST_PG_BIN
  // supports installations where the server binaries are elsewhere.
  binaries =
    process.env.JOVIE_TEST_PG_BIN ??
    execFileSync('pg_config', ['--bindir'], { encoding: 'utf8' }).trim();
  temporary = mkdtempSync(join(tmpdir(), 'jovie-insights-revenue-'));
  data = join(temporary, 'pgdata');
  execFileSync(
    join(binaries, 'initdb'),
    ['-D', data, '--no-locale', '--encoding=UTF8', '--no-sync'],
    { timeout: 30_000, stdio: 'pipe' }
  );
  runSql(`
    create table tips (id uuid primary key, creator_profile_id uuid, contact_email text, amount_cents int, created_at timestamp);
    create table audience_members (id uuid primary key, creator_profile_id uuid, email text);
    create table click_events (creator_profile_id uuid, audience_member_id uuid, city text, country text);
    create index on click_events (audience_member_id);
  `);
  execute.mockImplementation(async (query: SQL) => {
    const compiled = dialect.sqlToQuery(query);
    const sql = compiled.sql
      .trim()
      .replace(/;$/, '')
      .replace(/\$(\d+)\b/g, (_match, index: string) =>
        literal(compiled.params[Number(index) - 1])
      );
    const output = join(temporary, `${randomUUID()}.json`);
    runSql(
      `copy (select row_to_json(q) from (${sql}) q) to ${literal(output)};`
    );
    return { rows: [JSON.parse(readFileSync(output, 'utf8')) as unknown] };
  });
});

beforeEach(() => {
  execute.mockClear();
  runSql(`truncate tips, audience_members, click_events;
    insert into audience_members values
      (${literal(fan1)}, ${literal(profile)}, 'fan1@example.invalid'),
      (${literal(fan2)}, ${literal(profile)}, 'fan2@example.invalid');`);
});
afterAll(() => {
  if (temporary) rmSync(temporary, { recursive: true, force: true });
});

type Click = readonly [
  member: string,
  city: string,
  country: string,
  creator: string,
];
const repeatedClicks = (
  count: number,
  member = fan1,
  city = 'Austin'
): Click[] =>
  Array.from({ length: count }, () => [member, city, 'US', profile] as const);
const city = (name: string, totalCents: number, count: number) => ({
  city: name,
  totalCents,
  count,
});

const cases = [
  {
    name: 'one $5 tip despite repeated clicks',
    tips: [500],
    clicks: repeatedClicks(2),
    total: 500,
    cities: [city('Austin', 500, 1)],
  },
  {
    name: 'zero-click tip retained in overall totals',
    tips: [500],
    clicks: [],
    total: 500,
    cities: [],
  },
  {
    name: 'distinct equal-valued tips retained separately',
    tips: [500, 500],
    clicks: repeatedClicks(3),
    total: 1000,
    cities: [city('Austin', 1000, 2)],
  },
  {
    name: 'multiple zero-click tips retained in overall totals',
    tips: [500, 700],
    clicks: [],
    total: 1200,
    cities: [],
  },
  {
    name: 'mixed attributed and zero-click tips',
    tips: [500, 700],
    separateFans: true,
    clicks: repeatedClicks(3),
    total: 1200,
    cities: [city('Austin', 500, 1)],
  },
  {
    name: 'independent tippers counted once each',
    tips: [500, 700],
    separateFans: true,
    clicks: [...repeatedClicks(2), ...repeatedClicks(3, fan2, 'Seattle')],
    total: 1200,
    cities: [city('Seattle', 700, 1), city('Austin', 500, 1)],
  },
  {
    name: 'conflicting cities left unattributed',
    tips: [500],
    clicks: [...repeatedClicks(1), ...repeatedClicks(1, fan1, 'Seattle')],
    total: 500,
    cities: [],
  },
  {
    name: 'same city in different countries left unattributed',
    tips: [500],
    clicks: [
      [fan1, 'Cambridge', 'US', profile],
      [fan1, 'Cambridge', 'GB', profile],
    ],
    total: 500,
    cities: [],
  },
  {
    name: 'foreign-profile clicks excluded from attribution',
    tips: [500],
    clicks: [[fan1, 'Austin', 'US', otherProfile]],
    total: 500,
    cities: [],
  },
] satisfies Array<{
  name: string;
  tips: number[];
  separateFans?: boolean;
  clicks: Click[];
  total: number;
  cities: Array<ReturnType<typeof city>>;
}>;

describe('Insights tip revenue (real compiled SQL, isolated PostgreSQL)', () => {
  it.each(cases)('$name', async fixture => {
    const statements = fixture.tips.map(
      (amount, index) => `insert into tips values (
      ${literal(randomUUID())}, ${literal(profile)},
      ${literal(fixture.separateFans && index > 0 ? 'fan2@example.invalid' : 'fan1@example.invalid')},
      ${amount}, '2026-01-10');`
    );
    statements.push(
      ...fixture.clicks.map(
        click => `insert into click_events values (
      ${literal(click[3])}, ${literal(click[0])}, ${literal(click[1])}, ${literal(click[2])});`
      )
    );
    runSql(statements.join('\n'));
    const revenue = await aggregateRevenue(profile, period, previous);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(revenue).toMatchObject({
      totalTipsCurrent: fixture.total,
      totalTipsPrevious: 0,
      tipCountCurrent: fixture.tips.length,
      tipCountPrevious: 0,
      tipsByCity: fixture.cities,
    });
  });
});
