import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  getSidebarNavIconClassName,
  getSidebarNavRowClassName,
  SidebarNavItem,
} from './SidebarNavItem';

describe('SidebarNavItem active chrome', () => {
  it('uses white text and a Jovie teal icon without a left rail or decoration', () => {
    const row = getSidebarNavRowClassName({ active: true });
    const icon = getSidebarNavIconClassName({ active: true });

    expect(row).toContain('text-white');
    expect(row).toContain('shadow-none');
    expect(row).not.toContain('inset_2px_0');
    expect(row).not.toContain('before:');
    expect(row).not.toContain('after:');
    expect(icon).toContain('text-accent-teal!');
  });

  it('keeps long labels inside the grid and preserves keyboard focus chrome', () => {
    const longLabel =
      'A deliberately long navigation destination that must fade instead of overflowing';
    const TestIcon = (props: { className?: string }) => <svg {...props} />;

    render(
      <SidebarNavItem
        item={{ icon: TestIcon, label: longLabel }}
        collapsed={false}
      />
    );

    const row = screen.getByRole('button', { name: longLabel });
    const label = screen.getByText(longLabel);
    row.focus();
    fireEvent.focus(row);

    expect(row).toHaveFocus();
    expect(row.className).toContain('focus-visible:ring-2');
    expect(label.className).toContain('overflow-hidden');
    expect(label.className).toContain('text-clip');
    expect(label.className).toContain('mask-image:linear-gradient');
  });
});
