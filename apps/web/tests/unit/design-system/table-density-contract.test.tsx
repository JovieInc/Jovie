import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { buildAudienceMemberColumns } from '@/components/features/dashboard/organisms/dashboard-audience-table/table-config';
import { UnifiedTable } from '@/components/organisms/table/organisms/UnifiedTable';
import { TABLE_ROW_MODES } from '@/components/organisms/table/table.styles';
import type { ColumnDef } from '@/lib/tanstack-table';

/**
 * Table density contract (.claude/rules/ui.md "Tables and lists (Linear parity)").
 * User-facing rows are at least 40px; `dense` (32px) is admin/debug only.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = join(__dirname, '..', '..', '..');

// Shrink-only baseline (target 0, never raise). Counts `rowMode='dense'`,
// `rowMode="dense"` and `rowHeight={32}` under apps/web/app and
// apps/web/components outside the excluded paths below. The 3 remaining sites:
// ReleaseProviderMatrix and ReleaseTablePendingShell (desktop-list-density
// test pins them dense) and HomeLoopLatency. A follow-up moves them.
const DENSE_BASELINE = 3;

/** Admin/dev-only tooling, where 32px rows are allowed. */
const EXCLUDED = [
  'components/features/admin/', // founder/admin tools, not user-facing
  'app/app/(shell)/admin/', // admin routes
];

const PATTERN = /rowMode=(['"])dense\1|rowHeight=\{32\}/g;

function walk(dir: string, out: string[]) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === 'node_modules' || name === '__tests__') continue;
      walk(full, out);
    } else if (
      /\.tsx?$/.test(name) &&
      !/\.(test|stories|states\.stories|spec)\.tsx?$/.test(name)
    ) {
      out.push(full);
    }
  }
}

function denseSites(): string[] {
  const files: string[] = [];
  walk(join(WEB_ROOT, 'app'), files);
  walk(join(WEB_ROOT, 'components'), files);
  const hits: string[] = [];
  for (const file of files) {
    const rel = relative(WEB_ROOT, file).replaceAll('\\', '/');
    if (EXCLUDED.some(prefix => rel.startsWith(prefix))) continue;
    const matches = readFileSync(file, 'utf8').match(PATTERN);
    if (matches) hits.push(...matches.map(() => rel));
  }
  return hits;
}

describe('table density contract', () => {
  it('compact rows render at 40px or taller', () => {
    interface Row {
      readonly id: string;
      readonly name: string;
    }
    const columns: ColumnDef<Row, unknown>[] = [
      { accessorKey: 'name', header: 'Name' },
    ];
    const { container } = render(
      <UnifiedTable
        data={[{ id: '1', name: 'A' }]}
        columns={columns}
        getRowId={r => r.id}
        isLoading={false}
        rowMode='compact'
        enableVirtualization={false}
      />
    );
    const table = container.querySelector('table') as HTMLElement;
    const px = Number.parseInt(
      table.style.getPropertyValue('--table-row-height'),
      10
    );
    expect(px).toBeGreaterThanOrEqual(40);
    expect(TABLE_ROW_MODES.compact.rowHeight).toBeGreaterThanOrEqual(40);
  });

  it('Audience renders compact, not dense', () => {
    for (const file of [
      'DashboardAudienceTableUnified.tsx',
      'AudienceTableLoadingShell.tsx',
    ]) {
      const src = readFileSync(
        join(
          WEB_ROOT,
          'components/features/dashboard/organisms/dashboard-audience-table',
          file
        ),
        'utf8'
      );
      expect(src, file).toMatch(/rowMode=(\{[^}]*'compact'[^}]*\}|'compact')/);
      expect(src, file).not.toMatch(PATTERN);
    }
  });

  it('dense / 32px call sites only shrink', () => {
    const sites = denseSites();
    expect(
      sites.length,
      `dense call sites: ${sites.join(', ')}. Move user-facing tables to 'compact'.`
    ).toBeLessThanOrEqual(DENSE_BASELINE);
  });

  it('Audience has no row-number column and hides empty Alerts/Action', () => {
    const columns = buildAudienceMemberColumns('members');
    const ids = columns.map(c => (c as { id?: string }).id);
    expect(ids).not.toContain('index');
    expect(ids).not.toContain('rowNumber');
    for (const id of ['alerts', 'action']) {
      const col = columns.find(c => (c as { id?: string }).id === id);
      expect(col?.meta?.hideWhenEmpty, id).toBe(true);
    }
    const select = readFileSync(
      join(
        WEB_ROOT,
        'components/features/dashboard/organisms/dashboard-audience-table/utils/column-renderers.tsx'
      ),
      'utf8'
    );
    expect(select).not.toContain('rowNumber');
  });
});
