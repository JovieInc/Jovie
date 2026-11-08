import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Every table in the app renders through the shared table family in
 * components/organisms/table (UnifiedTable, AdminDataTable and their rows),
 * so row height, header, alignment, truncation, hover, focus, selection,
 * skeleton and empty state stay one design (docs/design-system/pen-briefs/
 * workspace-table.md). Hand-built `<table>` markup and direct use of the
 * low-level SemanticTable primitives outside that family are debt.
 *
 * Existing debt is listed per file below and may not grow. When a file
 * migrates, its count shrinks (a notice, never a failure); lower or delete
 * its entry in the same PR.
 */
const WEB_ROOT = path.resolve(import.meta.dirname, '../../..');
const ROOTS = ['app/app', 'components'];
const OWNER = 'components/organisms/table/';

const RAW_TABLE_BASELINE: Readonly<Record<string, number>> = {
  'app/app/(shell)/admin/_components/AdminScoreboardSection.tsx': 1,
  'app/app/(shell)/admin/features/FeatureFlagAuditSection.tsx': 1,
  'app/app/(shell)/admin/revenue-lift/RevenueLiftDashboardView.tsx': 3,
  'app/app/(shell)/admin/shipping/ShippingMatrix.tsx': 1,
  'app/app/(shell)/admin/shipping/ShippingStatistics.tsx': 1,
  // Migrates to UnifiedTable in the Links slice (claude/tables-1).
  'app/app/(shell)/links/LinksPageClient.tsx': 1,
  'components/features/admin/ShippingVelocityCanvas.tsx': 1,
  // Dev specimen and public marketing comparison tables, not app tables.
  'components/features/dev/NoirIonSpecimen.tsx': 1,
  'components/features/pricing/PricingComparisonChart.tsx': 2,
  'components/molecules/ContentTable.tsx': 1,
  'components/organisms/ComparisonPageContent.tsx': 1,
};

const RAW_TABLE_PATTERNS = [
  // JSX table element; a quoted or backticked mention in a comment is not.
  /(?<![`'"])<table[\s>]/g,
  /from ['"]@\/components\/organisms\/table\/molecules\/SemanticTable['"]/g,
] as const;

export function countRawTables(text: string): number {
  return RAW_TABLE_PATTERNS.reduce(
    (total, pattern) => total + (text.match(pattern)?.length ?? 0),
    0
  );
}

function sources(dir: string): string[] {
  return readdirSync(path.join(WEB_ROOT, dir), { withFileTypes: true })
    .flatMap(entry => {
      const rel = `${dir}/${entry.name}`;
      if (entry.isDirectory())
        return rel === OWNER.slice(0, -1) ? [] : sources(rel);
      return /\.tsx?$/.test(entry.name) &&
        !/\.(test|stories|spec)\.tsx?$/.test(entry.name)
        ? [rel]
        : [];
    })
    .sort();
}

function currentCounts(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const file of ROOTS.flatMap(sources)) {
    const found = countRawTables(
      readFileSync(path.join(WEB_ROOT, file), 'utf8')
    );
    if (found > 0) counts[file] = found;
  }
  return counts;
}

describe('raw table ratchet', () => {
  const current = currentCounts();

  it('no file adds hand-built table markup outside the shared table family', () => {
    const grown = Object.entries(current)
      .filter(([file, count]) => count > (RAW_TABLE_BASELINE[file] ?? 0))
      .map(
        ([file, count]) =>
          `${file}: ${count} > ${RAW_TABLE_BASELINE[file] ?? 0} (use UnifiedTable or AdminDataTable)`
      );
    expect(grown).toEqual([]);
  });

  it('reports migrated files as a notice, never a failure', () => {
    for (const [file, count] of Object.entries(RAW_TABLE_BASELINE)) {
      const now = current[file] ?? 0;
      if (now < count) {
        console.log(
          `::notice title=raw-table ratchet improved::${file} ${count}->${now}; lower its entry in raw-table-ratchet.test.ts`
        );
      }
    }
  });

  it('catches hand-built tables and SemanticTable imports (deliberate red)', () => {
    expect(countRawTables(`<table className='w-full'>`)).toBe(1);
    expect(countRawTables('<table>\n<tbody />')).toBe(1);
    expect(
      countRawTables(
        `import { TableRoot } from '@/components/organisms/table/molecules/SemanticTable';`
      )
    ).toBe(1);
    expect(countRawTables('// the old ad-hoc `<table>` shifted on load')).toBe(
      0
    );
    expect(countRawTables('<UnifiedTable data={rows} />')).toBe(0);
    expect(countRawTables('<tableau />')).toBe(0);
  });
});
