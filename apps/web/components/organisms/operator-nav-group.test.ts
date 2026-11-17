import { describe, expect, it } from 'vitest';
import { resolveOperatorNavGroup } from './operator-nav-group';

const items = [
  { href: '/app/ov/ops' },
  { href: '/app/ov/presence' },
  { href: '/app/ov/playlists' },
] as const;
const isActive = (item: { href: string }) => item.href === '/app/ov/presence';
const isNeverActive = () => false;

describe('resolveOperatorNavGroup', () => {
  it('keeps a stored-open group out of the collapsed rail (Tim, Nov 14)', () => {
    const group = resolveOperatorNavGroup({
      collapsible: true,
      items,
      isActive: isNeverActive,
      stored: true,
      railCollapsed: true,
    });
    expect(group.open).toBe(false);
    expect(group.items).toEqual([]);
    expect(group.pinnedInRail).toBe(false);
  });

  it('pins only the current page in the collapsed rail, set apart by a hairline', () => {
    const group = resolveOperatorNavGroup({
      collapsible: true,
      items,
      isActive,
      stored: true,
      railCollapsed: true,
    });
    expect(group.open).toBe(true);
    expect(group.items).toEqual([{ href: '/app/ov/presence' }]);
    expect(group.pinnedInRail).toBe(true);
  });

  it('shows every item of an always-open group in the collapsed rail', () => {
    const group = resolveOperatorNavGroup({
      collapsible: false,
      items,
      isActive: isNeverActive,
      stored: false,
      railCollapsed: true,
    });
    expect(group.open).toBe(true);
    expect(group.items).toBe(items);
    expect(group.pinnedInRail).toBe(false);
  });

  it('keeps the expanded sidebar unchanged: stored or active opens the full group', () => {
    for (const [stored, active, open] of [
      [true, false, true],
      [false, true, true],
      [false, false, false],
    ] as const) {
      const group = resolveOperatorNavGroup({
        collapsible: true,
        items,
        isActive: active ? isActive : isNeverActive,
        stored,
        railCollapsed: false,
      });
      expect(group.open).toBe(open);
      expect(group.items).toBe(items);
      expect(group.pinnedInRail).toBe(false);
    }
  });
});
