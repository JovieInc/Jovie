import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { buildAudienceMemberColumns } from '@/components/features/dashboard/organisms/dashboard-audience-table/table-config';
import { UnifiedTable } from '@/components/organisms/table/organisms/UnifiedTable';
import {
  TABLE_CANONICAL_ROW_MODE,
  TABLE_ROW_MODES,
} from '@/components/organisms/table/table.styles';
import type { ColumnDef } from '@/lib/tanstack-table';

/**
 * Table density contract (DRI-21 / taste #7).
 * Every UnifiedTable row is dense 32px — no compact/list forks.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = join(__dirname, '..', '..', '..');

const RETIRED_MODE_PATTERN =
  /rowMode=(['"])(compact|list|two-line|description|controls)\1|rowMode=\{[^}]*'(compact|list|two-line|description|controls)'[^}]*\}/g;

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

function retiredModeSites(): string[] {
  const files: string[] = [];
  walk(join(WEB_ROOT, 'app'), files);
  walk(join(WEB_ROOT, 'components'), files);
  const hits: string[] = [];
  for (const file of files) {
    const rel = relative(WEB_ROOT, file).replaceAll('\\', '/');
    const matches = readFileSync(file, 'utf8').match(RETIRED_MODE_PATTERN);
    if (matches) hits.push(...matches.map(() => `${rel}:${matches.join(',')}`));
  }
  return hits;
}

describe('table density contract', () => {
  it('dense rows render at 32px', () => {
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
        rowMode={TABLE_CANONICAL_ROW_MODE}
        enableVirtualization={false}
      />
    );
    const table = container.querySelector('table') as HTMLElement;
    const px = Number.parseInt(
      table.style.getPropertyValue('--table-row-height'),
      10
    );
    expect(px).toBe(32);
    expect(TABLE_ROW_MODES.dense.rowHeight).toBe(32);
    expect(Object.keys(TABLE_ROW_MODES)).toEqual(['dense']);
  });

  it('Audience uses dense, not retired modes', () => {
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
      expect(src, file).toMatch(/rowMode=['"]dense['"]/);
      expect(src, file).not.toMatch(RETIRED_MODE_PATTERN);
    }
  });

  it('adds no retired rowMode call sites', () => {
    const sites = retiredModeSites();
    expect(sites, sites.join('\n')).toEqual([]);
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
