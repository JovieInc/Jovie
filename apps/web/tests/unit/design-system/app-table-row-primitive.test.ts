import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  APP_TABLE_CELL_CONTENT_CLASSNAME,
  APP_TABLE_MEDIA_SIZE,
  APP_TABLE_ROW_ATTR,
  TABLE_CELL_CONTENT_CLASSNAME,
} from '@/components/organisms/table';

/**
 * Ratchet: new app tables/list rows must use the shared row primitive
 * (JOV-14762). Existing UnifiedTable + ShellListRowFrame already stamp
 * `data-app-table-row`. Hand-rolled flex rows that look like catalog tables
 * without the marker are blocked when they also introduce a new raw <table>
 * outside the table owner (covered by table-system-ratchet) — this file
 * locks the primitive contract itself.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = join(__dirname, '..', '..', '..');
const TABLE_OWNER = join('components', 'organisms', 'table') + sep;

describe('app table row primitive', () => {
  it('exports a flex + items-center cell content host', () => {
    expect(TABLE_CELL_CONTENT_CLASSNAME).toBe(APP_TABLE_CELL_CONTENT_CLASSNAME);
    expect(APP_TABLE_CELL_CONTENT_CLASSNAME).toContain('flex');
    expect(APP_TABLE_CELL_CONTENT_CLASSNAME).toContain('items-center');
    expect(APP_TABLE_CELL_CONTENT_CLASSNAME).not.toContain('content-center');
    expect(APP_TABLE_MEDIA_SIZE.dense).toBe(24);
    expect(APP_TABLE_MEDIA_SIZE.compact).toBe(28);
    expect(APP_TABLE_MEDIA_SIZE.list).toBe(32);
    expect(APP_TABLE_ROW_ATTR).toBe('data-app-table-row');
  });

  it('stamps data-app-table-row on VirtualizedTableRow and ShellListRowFrame', () => {
    const row = readFileSync(
      join(
        WEB_ROOT,
        'components/organisms/table/organisms/VirtualizedTableRow.tsx'
      ),
      'utf8'
    );
    const shell = readFileSync(
      join(WEB_ROOT, 'components/organisms/table/atoms/ShellListRowFrame.tsx'),
      'utf8'
    );
    expect(row).toContain("data-app-table-row='true'");
    expect(shell).toContain("'data-app-table-row': 'true'");
    expect(shell).toContain("data-app-table-row='true'");
  });

  it('keeps shell list density on fixed heights (no vertical padding drift)', () => {
    const shell = readFileSync(
      join(WEB_ROOT, 'components/organisms/table/atoms/ShellListRowFrame.tsx'),
      'utf8'
    );
    expect(shell).toContain("dense: 'h-8'");
    expect(shell).not.toMatch(/dense:\s*'min-h-8 py-1'/);
  });

  it('does not reintroduce baseline cell content outside the table owner', () => {
    const files: string[] = [];
    function walk(dir: string) {
      if (!existsSync(dir)) return;
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
          if (
            entry === 'node_modules' ||
            entry === '.next' ||
            entry === 'fixtures'
          ) {
            continue;
          }
          walk(full);
        } else if (
          entry.endsWith('.tsx') &&
          !/\.(test|stories)\.tsx$/.test(entry)
        ) {
          files.push(full);
        }
      }
    }
    walk(join(WEB_ROOT, 'components'));
    walk(join(WEB_ROOT, 'app'));

    const offenders: string[] = [];
    const banned =
      /data-table-cell-content=['"]stable['"][^>]*\bblock\b[^>]*\bcontent-center\b|\bblock\b[^>]*\bcontent-center\b[^>]*data-table-cell-content/;
    for (const file of files) {
      const rel = relative(WEB_ROOT, file);
      if (rel.startsWith(TABLE_OWNER)) continue;
      const source = readFileSync(file, 'utf8');
      if (banned.test(source)) offenders.push(rel);
      if (
        source.includes('TABLE_CELL_CONTENT_CLASSNAME =') &&
        source.includes('content-center')
      ) {
        offenders.push(rel);
      }
    }
    expect(offenders).toEqual([]);
  });
});
