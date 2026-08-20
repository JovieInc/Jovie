import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  getLinearPillClassName,
  linearPillFocusClassName,
  linearPillIndicatorClassName,
  linearPillLabelClassName,
} from './linear-pill';

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
  it('composes accessible target, focus, size, and tone classes', () => {
    const defaultPill = getLinearPillClassName({});
    const neutralPill = getLinearPillClassName({
      size: 'md',
      tone: 'neutral',
      className: 'custom-pill',
    });

    expect(defaultPill).toContain('before:h-11');
    expect(defaultPill).toContain('focus-visible:ring-focus/55');
    expect(defaultPill).toContain('bg-(--linear-btn-primary-bg)');
    expect(neutralPill).toContain('h-(--linear-pill-height-md)');
    expect(neutralPill).toContain('bg-(--linear-bg-button)');
    expect(neutralPill).toContain('custom-pill');
    expect(linearPillLabelClassName).toContain('before:min-w-11');
    expect(linearPillFocusClassName).toContain(
      'focus-visible:ring-offset-surface-page'
    );
    expect(linearPillIndicatorClassName).toContain('inset-y-0 left-0');
  });

  it('keeps the shared pill primitive on named System B tokens', () => {
    const source = readFileSync(sourcePath, 'utf8');
    const offenders = forbiddenPatterns
      .filter(pattern => pattern.test(source))
      .map(pattern => pattern.toString());

    expect(offenders, offenders.join(', ')).toEqual([]);
    expect(source).toContain('p-(--linear-pill-track-padding)');
    expect(source).toContain('shadow-(--linear-pill-surface-shadow)');
    expect(source).toContain('shadow-(--linear-pill-indicator-shadow)');
    expect(source).toContain('duration-subtle');
    expect(source).toContain('ease-subtle');
    expect(source.match(/motion-reduce:!transition-none/g)).toHaveLength(3);
    expect(source).not.toContain('motion-reduce:transition-none');
    expect(source).toContain('before:h-11');
    expect(source).toContain('before:min-w-11');
    expect(source).toContain('focus-visible:ring-focus/55');
    expect(source).toContain('focus-visible:ring-offset-surface-page');
    expect(source).toContain('absolute inset-y-0 left-0');
    expect(source).toContain('font-caption');
    expect(source).toContain('tracking-(--linear-caption-tracking)');
  });
});
