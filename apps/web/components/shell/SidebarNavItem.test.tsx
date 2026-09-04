import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  getSidebarNavIconClassName,
  getSidebarNavRowClassName,
  SidebarNavItem,
} from './SidebarNavItem';

describe('SidebarNavItem active chrome', () => {
  it('uses primary-token text and a Jovie teal icon without a left rail or decoration', () => {
    const row = getSidebarNavRowClassName({ active: true });
    const icon = getSidebarNavIconClassName({ active: true });

    expect(row).toContain('text-primary-token');
    expect(row).toContain('shadow-none');
    expect(row).not.toContain('inset_2px_0');
    expect(row).not.toContain('before:');
    expect(row).not.toContain('after:');
    expect(icon).toContain('text-accent-teal!');
  });

  it('keeps an enabled New Chat primary action off muted or disabled chrome', () => {
    const row = getSidebarNavRowClassName({ tone: 'primary' });
    const icon = getSidebarNavIconClassName({ tone: 'primary' });

    expect(row).toContain('bg-sidebar-accent/40');
    expect(row).toContain('text-sidebar-item-foreground');
    expect(row).not.toContain('opacity-50');
    expect(row).not.toContain('pointer-events-none');
    expect(row).not.toContain('text-sidebar-muted');
    expect(icon).toContain('text-accent-teal!');
    expect(icon).not.toContain('text-sidebar-muted/70');
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
    expect(label.className).toContain('justify-self-stretch');
    expect(label.className).not.toContain('justify-self-start');
    expect(label.className).toContain('mask-image:linear-gradient');
  });
});
