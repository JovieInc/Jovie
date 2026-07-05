import { describe, expect, it } from 'vitest';
import {
  parseVisualQaThemeToken,
  resolveVisualQaColorSchemes,
} from '@/lib/visual-qa/themes';

describe('visual-qa themes', () => {
  it('expands both to dark and light', () => {
    expect(resolveVisualQaColorSchemes('both')).toEqual(['dark', 'light']);
  });

  it('parses explicit theme tokens', () => {
    expect(parseVisualQaThemeToken('dark')).toBe('dark');
    expect(parseVisualQaThemeToken('light')).toBe('light');
    expect(parseVisualQaThemeToken('both')).toBe('both');
  });

  it('rejects invalid theme tokens', () => {
    expect(() => parseVisualQaThemeToken('sepia')).toThrow(/theme/i);
  });
});
