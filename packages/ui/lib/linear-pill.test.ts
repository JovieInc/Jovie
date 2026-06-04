import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const sourcePath = join(
  dirname(fileURLToPath(import.meta.url)),
  'linear-pill.ts'
);

const forbiddenPatterns = [
  /\brgba?\(/,
  /#[0-9A-Fa-f]{3,8}\b/,
  /\b(?:p|inset-y|left|shadow|text|font|tracking|duration|ease)-\[[^\]]+\]/,
  /\bduration-\d+\b/,
  /\bfont-\[[^\]]+\]/,
  /tracking-\[-/,
  /cubic-bezier\(/,
];

describe('linear pill System B token contract', () => {
  it('keeps the shared pill primitive on named System B tokens', () => {
    const source = readFileSync(sourcePath, 'utf8');
    const offenders = forbiddenPatterns
      .filter(pattern => pattern.test(source))
      .map(pattern => pattern.toString());

    expect(offenders, offenders.join(', ')).toEqual([]);
    expect(source).toContain('p-(--linear-pill-track-padding)');
    expect(source).toContain('shadow-(--linear-pill-surface-shadow)');
    expect(source).toContain('shadow-(--linear-pill-indicator-shadow)');
    expect(source).toContain('duration-normal');
    expect(source).toContain('ease-interactive');
    expect(source).toContain('font-caption');
    expect(source).toContain('tracking-(--linear-caption-tracking)');
  });
});
