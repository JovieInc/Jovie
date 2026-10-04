import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * One table system ratchet.
 *
 * Every app table renders through `components/organisms/table` (UnifiedTable,
 * its row modes, and its cells) so density, keyboard, selection, skeletons,
 * and virtualization behave the same everywhere. This ratchet fails when a
 * file outside that owner hand-rolls `<table>` markup, or when a table passes
 * a pixel `rowHeight` instead of a named `rowMode`, unless the file is already
 * listed in table-system.baseline.json. Counts may only go down.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
// tests/unit/design-system → apps/web
const WEB_ROOT = join(__dirname, '..', '..', '..');
const SCAN_DIRS = ['components', 'app'].map(d => join(WEB_ROOT, d));
const TABLE_OWNER = join('components', 'organisms', 'table') + sep;
const BASELINE_PATH = join(__dirname, 'table-system.baseline.json');

export const RAW_TABLE = /<table[\s>]/g;
export const RAW_ROW_HEIGHT = /\browHeight=\{\d+\}/g;
const TABLE_FILE = /Table/;

type Counts = Record<string, number>;

function walk(dir: string, out: string[]): void {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules' || entry === '.next' || entry === 'fixtures')
        continue;
      walk(full, out);
    } else if (
      entry.endsWith('.tsx') &&
      !/\.(test|stories)\.tsx$/.test(entry)
    ) {
      out.push(full);
    }
  }
}

export function scanTableSystem(): { rawTable: Counts; rawRowHeight: Counts } {
  const files: string[] = [];
  for (const dir of SCAN_DIRS) walk(dir, files);
  const rawTable: Counts = {};
  const rawRowHeight: Counts = {};
  for (const file of files) {
    const rel = relative(WEB_ROOT, file);
    if (rel.startsWith(TABLE_OWNER)) continue;
    const source = readFileSync(file, 'utf8');
    const tables = source.match(RAW_TABLE)?.length ?? 0;
    if (tables > 0) rawTable[rel] = tables;
    if (TABLE_FILE.test(source)) {
      const heights = source.match(RAW_ROW_HEIGHT)?.length ?? 0;
      if (heights > 0) rawRowHeight[rel] = heights;
    }
  }
  return { rawTable, rawRowHeight };
}

function overBaseline(current: Counts, baseline: Counts): string[] {
  return Object.entries(current)
    .filter(([file, count]) => count > (baseline[file] ?? 0))
    .map(([file, count]) => `${file} (${count} > ${baseline[file] ?? 0})`);
}

function staleBaseline(current: Counts, baseline: Counts): string[] {
  return Object.entries(baseline)
    .filter(([file, count]) => (current[file] ?? 0) < count)
    .map(([file, count]) => `${file} (${current[file] ?? 0} < ${count})`);
}

describe('one table system ratchet', () => {
  const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) as {
    rawTable: Counts;
    rawRowHeight: Counts;
  };
  const current = scanTableSystem();

  it('detects hand-rolled tables and pixel row heights', () => {
    expect('<table className="w-full">'.match(RAW_TABLE)).toHaveLength(1);
    expect('<UnifiedTable rowMode="dense" />'.match(RAW_TABLE)).toBeNull();
    expect(
      '<UnifiedTable rowHeight={44} />'.match(RAW_ROW_HEIGHT)
    ).toHaveLength(1);
    expect(
      '<UnifiedTable rowHeight={TABLE_ROW_HEIGHTS.STANDARD} />'.match(
        RAW_ROW_HEIGHT
      )
    ).toBeNull();
  });

  it('adds no hand-rolled <table> outside components/organisms/table', () => {
    expect(
      overBaseline(current.rawTable, baseline.rawTable),
      'Render app tables with UnifiedTable from @/components/organisms/table.'
    ).toEqual([]);
  });

  it('adds no pixel rowHeight; tables pick a named rowMode', () => {
    expect(
      overBaseline(current.rawRowHeight, baseline.rawRowHeight),
      "Use rowMode='dense' (32px) for people and records, or another TABLE_ROW_MODES entry."
    ).toEqual([]);
  });

  it('lowers the baseline in the same PR that migrates a table', () => {
    expect(staleBaseline(current.rawTable, baseline.rawTable)).toEqual([]);
    expect(staleBaseline(current.rawRowHeight, baseline.rawRowHeight)).toEqual(
      []
    );
  });
});
