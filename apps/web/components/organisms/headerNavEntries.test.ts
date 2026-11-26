import { describe, expect, it } from 'vitest';
import { toHeaderNavEntry } from './headerNavEntries';

const menu = (links: { href: string; label: string }[]) => ({
  id: 'customers',
  label: 'Customers',
  heading: 'Customers',
  links,
});

describe('toHeaderNavEntry', () => {
  it('drops an empty menu instead of drawing a caret over nothing', () => {
    expect(toHeaderNavEntry(menu([]))).toBeNull();
  });

  it('turns a one-link menu into a plain link to that link', () => {
    expect(toHeaderNavEntry(menu([{ href: '/a', label: 'A' }]))).toEqual({
      kind: 'link',
      id: 'customers',
      href: '/a',
      label: 'Customers',
    });
  });

  it('keeps a menu with two or more links as a flyout', () => {
    const entry = toHeaderNavEntry(
      menu([
        { href: '/a', label: 'A' },
        { href: '/b', label: 'B' },
      ])
    );
    expect(entry?.kind).toBe('flyout');
  });
});
