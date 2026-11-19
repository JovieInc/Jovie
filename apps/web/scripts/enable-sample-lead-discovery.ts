#!/usr/bin/env tsx
/**
 * JOV-12539 one-off. Applies the approved lead-finder sample to the
 * singleton settings row through the same four columns as
 * PATCH /api/admin/leads/settings. Does not change send settings.
 *
 * Refuses to run when FEATURE_INSTANTLY_OUTBOUND is exactly "true".
 * Dry-run unless --apply is passed.
 *
 * Run with DATABASE_URL set to the Jovie production database and
 * FEATURE_INSTANTLY_OUTBOUND unset. Do not wrap prd in `doppler run`:
 * that download is wider than this write, and the agent token cannot
 * read prd restricted secrets.
 *
 *   pnpm --filter @jovie/web exec tsx scripts/enable-sample-lead-discovery.ts --apply
 */
import { fileURLToPath } from 'node:url';
import { type NeonQueryFunction, neon } from '@neondatabase/serverless';
import {
  hasEnabledMusicArtistQuery,
  SAMPLE_LEAD_DISCOVERY_PATCH,
  shouldSeedDiscoveryKeywords,
} from '@/lib/leads/sample-discovery-settings';

const SETTINGS_ID = 1;

interface SettingsRow {
  readonly id: number;
  readonly enabled: boolean;
  readonly discovery_enabled: boolean;
  readonly auto_ingest_enabled: boolean;
  readonly daily_query_budget: number;
  readonly daily_send_cap: number;
  readonly max_per_hour: number;
  readonly ramp_mode: string;
  readonly guardrails_enabled: boolean;
  readonly queries_used_today: number;
}

interface KeywordRow {
  readonly query: string;
  readonly enabled: boolean;
}

function databaseUrl(): string {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error('DATABASE_URL is required');
  }
  if (!url.startsWith('postgres')) {
    throw new Error('DATABASE_URL must be a postgres URL');
  }
  return url;
}

function assertOutboundClosed(): void {
  if (process.env.FEATURE_INSTANTLY_OUTBOUND === 'true') {
    throw new Error(
      'Refusing to enable discovery while FEATURE_INSTANTLY_OUTBOUND is true'
    );
  }
}

async function readState(sql: NeonQueryFunction<false, false>) {
  const settings = (await sql`
    SELECT id, enabled, discovery_enabled, auto_ingest_enabled, daily_query_budget,
           daily_send_cap, max_per_hour, ramp_mode::text AS ramp_mode,
           guardrails_enabled, queries_used_today
    FROM lead_pipeline_settings
    WHERE id = ${SETTINGS_ID}
  `) as SettingsRow[];
  const keywords = (await sql`
    SELECT query, enabled
    FROM discovery_keywords
    ORDER BY created_at ASC
  `) as KeywordRow[];
  return { settings: settings[0] ?? null, keywords };
}

function publicState(
  settings: SettingsRow | null,
  keywords: readonly KeywordRow[]
) {
  const enabledCount = keywords.filter(keyword => keyword.enabled).length;
  return {
    settings,
    keywordTotal: keywords.length,
    enabledKeywords: enabledCount,
    musicArtistQueriesEnabled: hasEnabledMusicArtistQuery(keywords),
    wouldSeed: shouldSeedDiscoveryKeywords(enabledCount),
    maxDailyUsd: 1.5,
  };
}

async function seedKeywords(
  sql: NeonQueryFunction<false, false>
): Promise<number> {
  const { FEATURE_FM_SEED_KEYWORDS } = await import(
    '@/lib/leads/seed-keywords'
  );
  const { buildToolSearchQueries } = await import(
    '@/lib/leads/search-evidence'
  );
  const queries = [
    ...new Set([...FEATURE_FM_SEED_KEYWORDS, ...buildToolSearchQueries()]),
  ];
  let inserted = 0;
  for (const query of queries) {
    const rows = await sql`
      INSERT INTO discovery_keywords (query)
      VALUES (${query})
      ON CONFLICT (query) DO NOTHING
      RETURNING id
    `;
    inserted += rows.length;
  }
  return inserted;
}

async function applyPatch(
  sql: NeonQueryFunction<false, false>
): Promise<SettingsRow> {
  const patch = SAMPLE_LEAD_DISCOVERY_PATCH;
  const updated = (await sql`
    UPDATE lead_pipeline_settings
    SET enabled = ${patch.enabled},
        discovery_enabled = ${patch.discoveryEnabled},
        daily_query_budget = ${patch.dailyQueryBudget},
        auto_ingest_enabled = ${patch.autoIngestEnabled},
        updated_at = now()
    WHERE id = ${SETTINGS_ID}
    RETURNING id, enabled, discovery_enabled, auto_ingest_enabled, daily_query_budget,
              daily_send_cap, max_per_hour, ramp_mode::text AS ramp_mode,
              guardrails_enabled, queries_used_today
  `) as SettingsRow[];
  const row = updated[0];
  if (!row) {
    throw new Error('lead_pipeline_settings id 1 was not updated');
  }
  return row;
}

function sendColumnsUnchanged(
  before: SettingsRow,
  after: SettingsRow
): boolean {
  return (
    before.daily_send_cap === after.daily_send_cap &&
    before.max_per_hour === after.max_per_hour &&
    before.ramp_mode === after.ramp_mode &&
    before.guardrails_enabled === after.guardrails_enabled &&
    before.queries_used_today === after.queries_used_today
  );
}

export async function main(args = process.argv.slice(2)): Promise<void> {
  assertOutboundClosed();
  const apply = args.includes('--apply');
  const sql = neon(databaseUrl());
  const before = await readState(sql);
  if (!before.settings) {
    throw new Error('lead_pipeline_settings id 1 does not exist');
  }

  let inserted = 0;
  if (
    apply &&
    shouldSeedDiscoveryKeywords(before.keywords.filter(k => k.enabled).length)
  ) {
    inserted = await seedKeywords(sql);
  }

  const afterSettings = apply ? await applyPatch(sql) : before.settings;
  const after = apply ? await readState(sql) : before;
  if (apply && !sendColumnsUnchanged(before.settings, afterSettings)) {
    throw new Error('Send columns changed; expected them to stay put');
  }
  if (apply && !hasEnabledMusicArtistQuery(after.keywords)) {
    throw new Error('No enabled music-artist discovery keyword after apply');
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        apply,
        insertedKeywords: inserted,
        before: publicState(before.settings, before.keywords),
        after: publicState(after.settings, after.keywords),
        instantlyOutboundExactTrue: false,
      },
      null,
      2
    )}\n`
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    const message =
      error instanceof Error ? error.message : 'sample discovery failed';
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
