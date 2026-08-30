import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { getClampedPercent } from './percentages';

describe('getClampedPercent', () => {
  it('returns the rounded percentage for normal funnel ratios', () => {
    expect(getClampedPercent(50, 100)).toBe(50);
    expect(getClampedPercent(100, 100)).toBe(100);
  });

  it('returns zero when the numerator is empty or the denominator is invalid', () => {
    expect(getClampedPercent(0, 100)).toBe(0);
    expect(getClampedPercent(50, -100)).toBe(0);
    expect(getClampedPercent(1, 0)).toBe(0);
  });

  it('keeps impossible funnel rates inside the visible percentage range', () => {
    expect(getClampedPercent(125, 100)).toBe(100);
    expect(getClampedPercent(-5, 100)).toBe(0);
  });
});

describe('JOV-5466 token retire', () => {
  it('does not keep retired --linear-app-* tokens', () => {
    const source = readFileSync(resolve(__dirname, './GtmFunnel.tsx'), 'utf8');
    expect(source).not.toMatch(/--linear-app-/);
  });
});
