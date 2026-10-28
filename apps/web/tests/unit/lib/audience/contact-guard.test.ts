import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Regression guard for the Level-2 "share with artist" gate.
 *
 * Fails when any server code (routes, pages and lib/**) reads contact columns
 * (email, phone, tipper identity, pre-save fan email) from the audience tables
 * and does not actually CALL the gate on the rows it returns. An import alone
 * does not count. Jovie-side senders, subject-facing handlers (opt-in,
 * unsubscribe, webhooks) and internal aggregates must be listed in ALLOWLIST
 * with a reason; the stale-entry check keeps that list honest.
 *
 * History: live exposure found 2026-10-24 (members API, CSV, vCard,
 * subscribers GET, earnings tipper identity).
 */
const ROOT = join(__dirname, '../../../..');
const SCAN_DIRS = ['app/api', 'app/app', 'lib'];
const SKIP_PREFIXES = ['lib/db/schema/'];

// A gate call on returned rows (not just an import).
const GATE_CALL = /\b(?:applyShareGate|redactUnsharedContact)\s*\(/;

// A read of a contact column from an audience table, an alias-proof read of
// tipper identity, the pre-save fan email, or raw SQL over those tables.
const COLUMN_READ =
  /\b(?:audienceMembers|notificationSubscriptions|tipAudience|preSaveTokens|preSaves?)\.(?:email|phone|fanEmail)\b|\btips\.(?:contactEmail|contactPhone|tipperName)\b|\b(?:fanEmail|fan_email|contactPhone)\b/;
const RAW_SQL_READ =
  /\b(?:FROM|JOIN)\s+(?:notification_subscriptions|audience_members|tip_audience|pre_save_tokens|tips)\b/i;

export const ALLOWLIST: Readonly<Record<string, string>> = {
  'app/api/audience/opt-in/route.ts':
    'subject-facing opt-in handler acting on the visitor own token',
  'app/api/audience/unsubscribe/route.ts':
    'subject-facing unsubscribe handler acting on the visitor own token',
  'app/api/cron/schedule-release-notifications/route.ts':
    'Jovie-side sender (Level 1); recipients never returned to the artist',
  'app/api/cron/send-release-notifications/route.ts':
    'Jovie-side sender (Level 1); recipients never returned to the artist',
  'app/api/dashboard/activity/recent/route.ts':
    'email/phone only build dedupe keys; copy never includes them (Opus review 2026-10-24)',
  'app/api/notifications/confirm/route.ts':
    'subject-facing double opt-in confirmation by token',
  'app/api/notifications/update-subscriber-field.ts':
    'subject-facing preference update within minutes of their own subscription',
  'app/api/pre-save/apple/route.ts':
    'writes the pre-save token; fan_email has no artist-facing reader (Opus sweep 2026-10-24)',
  'app/api/pre-save/spotify/callback/route.ts':
    'writes the pre-save token; fan_email has no artist-facing reader (Opus sweep 2026-10-24)',
  'app/app/(shell)/dashboard/audience/block-actions.ts':
    'server-only snapshot for blocking a visitor; never returned to the client',
  'lib/admin/conversion-funnel.ts':
    'Jovie-admin aggregate counts, not artist-facing',
  'lib/admin/platform-stats.ts':
    'Jovie-admin aggregate counts, not artist-facing',
  'lib/analytics/data-retention.ts':
    'retention SQL that deletes rows; returns no contact data',
  'lib/connectors/workflows/outcome-attribution.ts':
    'IS NOT NULL presence checks only; returns no contact data',
  'lib/db/audience-action-owners.ts':
    'backfill SQL keyed by ids; returns no contact data',
  'lib/db/queries/analytics.ts':
    'export candidates are gated by buildSubscriberExportRows (share + revocation); SMS recipients feed a Jovie-side sender',
  'lib/metrics/artist-revenue-cohorts.ts':
    'IS NOT NULL presence checks only; returns no contact data',
  'lib/notifications/audience-alert-state.ts':
    'denormalizes alert state onto members; returns no contact data',
  'lib/notifications/domain.ts':
    'subject-facing subscribe/confirm/preferences domain, Jovie-side sender queries, and the share-consent lookup',
  'lib/notifications/otp-service.ts':
    'subject-facing OTP verification and audience upsert',
  'lib/notifications/sms-suppression.ts':
    'Jovie-side SMS suppression; no artist-facing return',
  'lib/notifications/sms-webhook.ts':
    'carrier STOP/HELP webhook; no artist-facing return',
  'lib/services/tips/process-tip-completed.ts':
    'payment webhook writing the tip audience; no artist-facing return',
};

export interface GuardFile {
  readonly path: string;
  readonly source: string;
}

export function findUngatedContactReaders(
  files: readonly GuardFile[],
  allowlist: Readonly<Record<string, string>> = ALLOWLIST
): string[] {
  return files
    .filter(f => !(f.path in allowlist))
    .filter(f => COLUMN_READ.test(f.source) || RAW_SQL_READ.test(f.source))
    .filter(f => !GATE_CALL.test(f.source))
    .map(f => f.path);
}

function listSources(dir: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  return entries.flatMap(name => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return listSources(full);
    if (!/\.(ts|tsx)$/.test(name)) return [];
    if (/\.(test|stories)\.(ts|tsx)$/.test(name)) return [];
    return [full];
  });
}

function loadRepoFiles(): GuardFile[] {
  return SCAN_DIRS.flatMap(d => listSources(join(ROOT, d)))
    .map(full => ({
      path: relative(ROOT, full),
      source: readFileSync(full, 'utf8'),
    }))
    .filter(f => !SKIP_PREFIXES.some(p => f.path.startsWith(p)));
}

describe('contact gate guard', () => {
  it('no server reader of audience contact columns skips the share gate call', () => {
    expect(findUngatedContactReaders(loadRepoFiles())).toEqual([]);
  });

  it('deliberate red: an ungated reader is flagged', () => {
    const bad: GuardFile = {
      path: 'app/api/dashboard/audience/leak/route.ts',
      source: `
        const rows = await tx.select({ email: notificationSubscriptions.email })
          .from(notificationSubscriptions);
        return NextResponse.json({ rows });
      `,
    };
    expect(findUngatedContactReaders([bad])).toEqual([bad.path]);

    const rawSql: GuardFile = {
      path: 'lib/services/leak2.ts',
      source:
        'await tx.execute(sql`SELECT email FROM notification_subscriptions`)',
    };
    expect(findUngatedContactReaders([rawSql])).toEqual([rawSql.path]);
  });

  it('deliberate red: lib readers, pre-save fan email and aliased tipper reads are flagged', () => {
    const preSave: GuardFile = {
      path: 'lib/services/pre-save-list.ts',
      source: 'select({ e: preSaveTokens.fanEmail }).from(preSaveTokens)',
    };
    const alias: GuardFile = {
      path: 'lib/services/tippers.ts',
      source:
        'const t = tips; select({ n: tips.tipperName, p: tips.contactPhone })',
    };
    expect(findUngatedContactReaders([preSave, alias])).toEqual([
      preSave.path,
      alias.path,
    ]);
  });

  it('deliberate red: importing the gate without calling it is flagged', () => {
    const importOnly: GuardFile = {
      path: 'app/api/dashboard/audience/import-only/route.ts',
      source: `import { applyShareGate } from '@/lib/audience/share-gate';
        select({ email: audienceMembers.email });
        return NextResponse.json({ rows });`,
    };
    expect(findUngatedContactReaders([importOnly])).toEqual([importOnly.path]);
  });

  it('a reader that calls the gate on its rows passes', () => {
    const ok: GuardFile = {
      path: 'app/api/dashboard/audience/ok/route.ts',
      source: `import { applyShareGate } from '@/lib/audience/share-gate';
        select({ email: audienceMembers.email });
        return NextResponse.json({ rows: applyShareGate(rows, keys) });`,
    };
    expect(findUngatedContactReaders([ok])).toEqual([]);
  });

  it('every allowlist entry still exists and still needs it (no stale exemptions)', () => {
    const files = loadRepoFiles();
    for (const path of Object.keys(ALLOWLIST)) {
      const file = files.find(f => f.path === path);
      expect(file, `${path} is allowlisted but missing`).toBeDefined();
      expect(
        COLUMN_READ.test(file?.source ?? '') ||
          RAW_SQL_READ.test(file?.source ?? ''),
        `${path} no longer reads contact columns; remove it from ALLOWLIST`
      ).toBe(true);
      expect(
        GATE_CALL.test(file?.source ?? ''),
        `${path} now calls the gate; remove it from ALLOWLIST`
      ).toBe(false);
    }
  });
});
