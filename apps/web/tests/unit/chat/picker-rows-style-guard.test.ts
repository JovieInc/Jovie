import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '../../..');
const PICKER_ROWS = join(ROOT, 'components/jovie/components/picker-rows.tsx');

const RAW_VISUAL_CLASS_PATTERNS = [
  /(?:^|[\s'"])(?:bg|text|border|accent|shadow|rounded|p|px|py|pt|pr|pb|pl|m|mx|my|mt|mr|mb|ml|h|w|size|top|left|right|bottom|inset|gap|tracking|leading|font|from|via|to)-(?:[^\s'"]+)/g,
  /['"][^'"]*#[0-9a-fA-F]{3,8}[^'"]*['"]/g,
  /['"][^'"]*rgba?\([^'"]*['"]/g,
  /['"][^'"]*bg-gradient-to-[^'"]*['"]/g,
  /['"][^'"]*shadow-\[[^'"]*['"]/g,
];

function lineNumberFor(source: string, index: number): number {
  return source.slice(0, index).split('\n').length;
}

function rawVisualOffendersFor(source: string): string[] {
  return RAW_VISUAL_CLASS_PATTERNS.flatMap(pattern =>
    [...source.matchAll(pattern)].map(
      match =>
        `picker-rows.tsx:${lineNumberFor(source, match.index ?? 0)} ${match[0].replace(/\s+/g, ' ').trim()}`
    )
  );
}

describe('picker row style guard', () => {
  it('keeps picker artwork and row visuals behind System B primitives', () => {
    const source = readFileSync(PICKER_ROWS, 'utf8');
    const offenders = rawVisualOffendersFor(source);

    expect(
      offenders,
      `Picker row visuals should live in system-b-picker-* CSS primitives.\n${offenders.join('\n')}`
    ).toEqual([]);
  });

  it('catches standard Tailwind visual utilities without rejecting allowed layout scaffolding', () => {
    const offenders = rawVisualOffendersFor(
      "<div className='bg-zinc-900 rounded-lg h-9 w-9 text-sm min-w-0 flex-1 object-cover' />"
    );

    expect(offenders).toEqual(
      expect.arrayContaining([
        expect.stringContaining('bg-zinc-900'),
        expect.stringContaining('rounded-lg'),
        expect.stringContaining('h-9'),
        expect.stringContaining('w-9'),
        expect.stringContaining('text-sm'),
      ])
    );
    expect(offenders).not.toEqual(
      expect.arrayContaining([
        expect.stringContaining('min-w-0'),
        expect.stringContaining('flex-1'),
        expect.stringContaining('object-cover'),
      ])
    );
  });
});
