import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '../../..');
const SHARED_COMMAND_PALETTE = join(
  ROOT,
  'components/organisms/SharedCommandPalette.tsx'
);

const RAW_ROW_SURFACE_PATTERNS = [
  /(?:^|[\s'"])(?:bg|border|shadow|rounded|ring|outline)-(?:[^\s'"]+)/g,
  /['"][^'"]*#[0-9a-fA-F]{3,8}[^'"]*['"]/g,
  /['"][^'"]*rgba?\([^'"]*['"]/g,
  /['"][^'"]*bg-gradient-to-[^'"]*['"]/g,
  /['"][^'"]*shadow-\[[^'"]*['"]/g,
];

function lineNumberFor(source: string, index: number): number {
  return source.slice(0, index).split('\n').length;
}

function rawRowSurfaceOffendersFor(source: string): string[] {
  return RAW_ROW_SURFACE_PATTERNS.flatMap(pattern =>
    [...source.matchAll(pattern)].map(
      match =>
        `SharedCommandPalette.tsx:${lineNumberFor(source, match.index ?? 0)} ${match[0].replace(/\s+/g, ' ').trim()}`
    )
  );
}

function cmdKPaletteRowSource(source: string): string {
  const start = source.indexOf('function CmdKPaletteRow');
  const end = source.indexOf('\nexport function PaletteList', start);

  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe('picker row style guard', () => {
  it('keeps Cmd+K result rows on the shared dense table-row primitive', () => {
    const source = readFileSync(SHARED_COMMAND_PALETTE, 'utf8');
    const rowSource = cmdKPaletteRowSource(source);
    const offenders = rawRowSurfaceOffendersFor(rowSource);

    expect(
      offenders,
      `Cmd+K result-row surfaces should live in the shared table-row primitive.\n${offenders.join('\n')}`
    ).toEqual([]);
    expect(source).toContain(
      "import { ShellListRowFrame } from './table/atoms/ShellListRowFrame';"
    );
    expect(rowSource).toContain("className='system-b-table-row-shell");
    expect(rowSource).toContain("<RowVisual item={item} variant='dense' />");
    expect(rowSource).toContain("<RowBody item={item} variant='dense' />");
    expect(rowSource).not.toContain('system-b-picker-row');
  });

  it('catches local row-surface treatment without rejecting structural table layout', () => {
    const offenders = rawRowSurfaceOffendersFor(
      "<div className='bg-zinc-900 rounded-lg h-9 w-9 text-sm min-w-0 flex-1 object-cover' />"
    );

    expect(offenders).toEqual(
      expect.arrayContaining([
        expect.stringContaining('bg-zinc-900'),
        expect.stringContaining('rounded-lg'),
      ])
    );
    expect(offenders).not.toEqual(
      expect.arrayContaining([
        expect.stringContaining('h-9'),
        expect.stringContaining('w-9'),
        expect.stringContaining('text-sm'),
        expect.stringContaining('min-w-0'),
        expect.stringContaining('flex-1'),
        expect.stringContaining('object-cover'),
      ])
    );
  });
});
