import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const shellDir = __dirname;

const captionAtomFiles = [
  'Stat.tsx',
  'ColumnLabel.tsx',
  'PerformanceCard.tsx',
  'CuesPanel.tsx',
  'LyricsList.tsx',
] as const;

describe('shell caption Title Case contract (JOV-5293)', () => {
  it('keeps SHELL_CAPTION_CLASSNAME on tracking-normal without tracked caps', () => {
    const source = readFileSync(
      path.join(shellDir, 'shell-caption.ts'),
      'utf8'
    );

    expect(source).toContain('export const SHELL_CAPTION_CLASSNAME =');
    expect(source).toContain('tracking-normal');
    expect(source).not.toContain('uppercase tracking');
    expect(source).not.toMatch(/\buppercase\b/);
  });

  it.each(
    captionAtomFiles
  )('%s uses SHELL_CAPTION_CLASSNAME and does not reintroduce tracked caps', fileName => {
    const source = readFileSync(path.join(shellDir, fileName), 'utf8');

    expect(source).toContain("from './shell-caption'");
    expect(source).toContain('SHELL_CAPTION_CLASSNAME');
    expect(source).not.toContain('uppercase tracking');
    expect(source).not.toMatch(/\buppercase\b/);
  });
});
