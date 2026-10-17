import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const webRoot = path.resolve(import.meta.dirname, '../../../..');
function sources(directory: string): string[] {
  return readdirSync(path.join(webRoot, directory), {
    withFileTypes: true,
  }).flatMap(entry => {
    const name = `${directory}/${entry.name}`;
    if (entry.isDirectory()) return sources(name);
    return name.endsWith('.tsx') && !/\.(test|stories)\.tsx$/.test(name)
      ? [name]
      : [];
  });
}

// Document report exceptions; shrinking this list is safe, growing it needs a migration.
const REPORT_TABLES = [
  'app/app/(shell)/admin/_components/AdminScoreboardSection.tsx',
  'app/app/(shell)/admin/features/FeatureFlagAuditSection.tsx',
  'app/app/(shell)/admin/revenue-lift/RevenueLiftDashboardView.tsx',
  'app/app/(shell)/admin/shipping/ShippingMatrix.tsx',
  'app/app/(shell)/admin/shipping/ShippingStatistics.tsx',
  'components/features/admin/ShippingVelocityCanvas.tsx',
  'components/features/admin/hud/FounderFunnelDrilldown.tsx',
];
const OWNERS: Record<string, readonly string[]> = {
  EntitySidebarShell: ['components/features/admin/layout/AdminDetailRail.tsx'],
  RightDrawer: [],
  UnifiedTable: ['components/features/admin/table/AdminDataTable.tsx'],
  table: REPORT_TABLES,
};

describe('admin canonical primitive boundaries', () => {
  it('prevents new local tables or inspectors outside the canonical adapters', () => {
    const violations: string[] = [];
    for (const file of [
      ...sources('components/features/admin'),
      ...sources('app/app/(shell)/admin'),
    ]) {
      const ast = ts.createSourceFile(
        file,
        readFileSync(path.join(webRoot, file), 'utf8'),
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX
      );
      const visit = (node: ts.Node) => {
        if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
          const tag = node.tagName.getText(ast);
          if (OWNERS[tag] && !OWNERS[tag].includes(file))
            violations.push(`${file}: ${tag}`);
        }
        ts.forEachChild(node, visit);
      };
      visit(ast);
    }
    expect(violations).toEqual([]);
  });
});
