import { describe, expect, it } from 'vitest';
import { cn } from '@/lib/utils';

// Regression: plain twMerge treated `text-secondary-token` (a colour) as
// conflicting with `text-app` (a font size) and dropped the size, so
// EmptyState headings rendered at the 16px browser default (2026-10-29).
describe('cn keeps Jovie font-size steps beside token colours', () => {
  it.each(['text-app', 'text-2xs', 'text-3xs'])(
    'keeps %s with a text colour token',
    size => {
      const merged = cn(`mb-1 ${size} font-caption`, 'text-secondary-token');
      expect(merged.split(' ')).toEqual(
        expect.arrayContaining([size, 'text-secondary-token'])
      );
    }
  );

  it('still resolves a real font-size conflict to the last class', () => {
    expect(cn('text-app', 'text-sm')).toBe('text-sm');
  });
});
