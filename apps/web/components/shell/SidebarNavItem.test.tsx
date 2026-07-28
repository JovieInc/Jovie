import { describe, expect, it } from 'vitest';
import {
  getSidebarNavIconClassName,
  getSidebarNavRowClassName,
} from './SidebarNavItem';

describe('SidebarNavItem active chrome', () => {
  it('uses white text and an accent-blue icon without a left rail', () => {
    const row = getSidebarNavRowClassName({ active: true });
    const icon = getSidebarNavIconClassName({ active: true });

    expect(row).toContain('text-white');
    expect(row).toContain('shadow-none');
    expect(row).not.toContain('inset_2px_0');
    expect(icon).toContain('text-accent-blue!');
  });
});
