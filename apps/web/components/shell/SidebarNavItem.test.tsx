import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  getSidebarNavIconClassName,
  getSidebarNavLabelClassName,
  getSidebarNavRowClassName,
  SidebarNavItem,
  sidebarNavLabelNeedsFade,
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

  it('does not mask-fade compact create labels like New Chat', () => {
    const TestIcon = (props: { className?: string }) => <svg {...props} />;

    expect(sidebarNavLabelNeedsFade({ tone: 'primary' })).toBe(false);
    expect(sidebarNavLabelNeedsFade({ tone: 'secondary' })).toBe(false);
    expect(
      sidebarNavLabelNeedsFade({ tone: 'primary', trailingOverlay: true })
    ).toBe(false);
    expect(getSidebarNavLabelClassName({ tone: 'primary' })).not.toContain(
      'mask-image:linear-gradient'
    );
    expect(getSidebarNavLabelClassName({ tone: 'secondary' })).not.toContain(
      'mask-image:linear-gradient'
    );

    render(
      <SidebarNavItem
        item={{ icon: TestIcon, label: 'New Chat' }}
        collapsed={false}
        tone='primary'
      />
    );

    const label = screen.getByText('New Chat');
    expect(label.className).not.toContain('mask-image:linear-gradient');
    expect(label.className).not.toContain('-webkit-mask-image:linear-gradient');
    expect(label.className).toContain('overflow-hidden');
    expect(label.className).toContain('text-clip');
    expect(sidebarNavLabelNeedsFade({})).toBe(true);
    expect(sidebarNavLabelNeedsFade({ trailingOverlay: true })).toBe(true);
    expect(getSidebarNavLabelClassName({})).toContain(
      'mask-image:linear-gradient'
    );
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
    expect(sidebarNavLabelNeedsFade({})).toBe(true);
    expect(sidebarNavLabelNeedsFade({ trailingOverlay: true })).toBe(true);
    expect(getSidebarNavLabelClassName({})).toContain(
      'mask-image:linear-gradient'
    );
  });
});
