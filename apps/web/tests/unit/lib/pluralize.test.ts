import { describe, expect, it } from 'vitest';
import { pluralize } from '@/lib/utils/pluralize';

describe('pluralize', () => {
  it('agrees the noun with the count', () => {
    expect(pluralize(0, 'Item')).toBe('0 Items');
    expect(pluralize(1, 'Item')).toBe('1 Item');
    expect(pluralize(2, 'Item')).toBe('2 Items');
  });

  it('accepts an irregular plural', () => {
    expect(pluralize(1, 'Person', 'People')).toBe('1 Person');
    expect(pluralize(3, 'Person', 'People')).toBe('3 People');
  });
});
