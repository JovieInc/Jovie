import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Regression guard for the Level-2 "share with artist" gate.
 *
 * Fails when an artist-facing route or reader selects email/phone (or tipper
 * identity) from the audience tables without importing the gate helper, so a
 * new endpoint cannot silently expose Level-1 contact details again
 * (live exposure found 2026-10-24: members API, CSV, vCard, subscribers GET).
 *
 * Add a file to ALLOWLIST only with a reason (Jovie-side senders, opt-in /
 * unsubscribe / webhook handlers, server-only dedupe keys).
 */
const ROOT = join(__dirname, '../../../..');
const SCAN_DIRS = [
  'app/api/dashboard',
  'app/app',
  'app/api/mobile',
  'lib/chat',
  'lib/ovie',
];
const GATE_IMPORT = '@/lib/audience/share-gate';

// A read of a contact column from an audience table, or raw SQL that selects
// contact columns from one of them.
const COLUMN_READ =
  /\b(?:audienceMembers|notificationSubscriptions|tipAudience)\.(?:email|phone)\b|\btips\.(?:contactEmail|contactPhone|tipperName)\b/;
const RAW_SQL_READ =
  /\b(?:FROM|JOIN)\s+(?:notification_subscriptions|audience_members|tip_audience)\b/i;

export const ALLOWLIST: Readonly<Record<string, string>> = {
  'app/api/dashboard/activity/recent/route.ts':
    'email/phone only build dedupe keys; copy never includes them (Opus review 2026-10-24)',
  'app/app/(shell)/dashboard/audience/block-actions.ts':
    'server-only snapshot for blocking a visitor; never returned to the client',
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
    .filter(f => !f.source.includes(GATE_IMPORT))
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
  return SCAN_DIRS.flatMap(d => listSources(join(ROOT, d))).map(full => ({
    path: relative(ROOT, full),
    source: readFileSync(full, 'utf8'),
  }));
}

describe('contact gate guard', () => {
  it('no artist-facing reader selects contact columns without the share gate', () => {
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
      path: 'app/api/dashboard/audience/leak2/route.ts',
      source:
        'await tx.execute(sql`SELECT email FROM notification_subscriptions`)',
    };
    expect(findUngatedContactReaders([rawSql])).toEqual([rawSql.path]);
  });

  it('a reader that imports the gate passes', () => {
    const ok: GuardFile = {
      path: 'app/api/dashboard/audience/ok/route.ts',
      source: `import { applyShareGate } from '${GATE_IMPORT}';
        select({ email: audienceMembers.email })`,
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
    }
  });
});
