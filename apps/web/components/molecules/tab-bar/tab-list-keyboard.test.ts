import { describe, expect, it } from 'vitest';
import { nextTabValue } from './tab-list-keyboard';

const OPTIONS = [
  { value: 'details', label: 'Details' },
  { value: 'assets', label: 'Assets' },
  { value: 'links', label: 'Links', disabled: true },
  { value: 'rights', label: 'Rights' },
] as const;

describe('tab-list-keyboard', () => {
  it('skips disabled tabs, wraps at the edges, and honors Home/End', () => {
    expect(nextTabValue(OPTIONS, 'details', 'ArrowRight')).toBe('assets');
    expect(nextTabValue(OPTIONS, 'assets', 'ArrowRight')).toBe('rights');
    expect(nextTabValue(OPTIONS, 'details', 'ArrowLeft')).toBe('rights');
    expect(nextTabValue(OPTIONS, 'rights', 'ArrowRight')).toBe('details');
    expect(nextTabValue(OPTIONS, 'details', 'Home')).toBe('details');
    expect(nextTabValue(OPTIONS, 'details', 'End')).toBe('rights');
    expect(nextTabValue([], 'details', 'ArrowRight')).toBeNull();
    expect(nextTabValue(OPTIONS, 'details', 'Space')).toBeNull();
  });
});
