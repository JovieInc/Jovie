import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { getClampedPercent } from './GtmFunnel';

describe('getClampedPercent', () => {
  it('keeps impossible funnel rates inside the visible percentage range', () => {
    expect(getClampedPercent(125, 100)).toBe(100);
    expect(getClampedPercent(-5, 100)).toBe(0);
    expect(getClampedPercent(1, 0)).toBe(0);
  });
});
