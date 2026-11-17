import { fireEvent, render, screen, within } from '@testing-library/react';
import { type ComponentPropsWithoutRef, forwardRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { banner } from '@/components/feedback/banner-store';
import { DesktopUpdateControl } from '@/components/organisms/desktop-update/DesktopUpdateControl';
import type { DesktopUpdateControlState } from '@/lib/desktop/desktop-update-control-state';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import {
  SidebarDock,
  type SidebarDockUpdateControl,
  sidebarDockSeenKey,
} from './SidebarDock';

// Expose the Next Link contract without starting a router in jsdom.
vi.mock('next/link', () => ({
  default: forwardRef<
    HTMLAnchorElement,
    ComponentPropsWithoutRef<'a'> & { readonly prefetch?: boolean }
  >(function TestLink({ prefetch, ...props }, ref) {
    return <a {...props} data-prefetch={String(prefetch)} ref={ref} />;
  }),
}));

const release = {
  id: '2026-10-15',
  title: 'Your latest releases',
  date: '2026-10-15',
  summary: '',
  url: '/changelog',
  highlights: [],
  dogfood: [],
};
/** The update slot, filled the way SidebarDockBridge fills it. */
const updateControl = (
  state: DesktopUpdateControlState,
  onRestart = vi.fn()
): SidebarDockUpdateControl => ({
  visible: true,
  label: 'Update',
  urgent: state.kind === 'failed',
  node: (
    <DesktopUpdateControl
      state={state}
      onDownload={vi.fn()}
      onRestart={onRestart}
      onRetry={vi.fn()}
    />
  ),
});

beforeEach(() => {
  banner.dismiss();
  localStorage.clear();
  vi.clearAllMocks();
});
afterEach(() => {
  banner.dismiss();
  localStorage.clear();
});

describe('SidebarDock cards on the shared inset panel', () => {
  it('puts What’s new on the shared gradient panel with its name, link and dismiss', async () => {
    const { container } = render(
      <SidebarDock userId='one' release={release} />
    );

    // The dock sits on the sidebar's own 12px inset.
    expect(container.querySelector('[data-sidebar-dock]')).toHaveClass(
      'px-3',
      'pb-(--space-2-5)'
    );
    const card = screen.getByRole('region', { name: "What's New" });
    expect(card.tagName).toBe('SECTION');
    expect(card).toHaveAttribute('data-dock-card', 'whats-new');
    expect(card).toHaveAttribute('data-slot', 'inset-panel');
    expect(card).toHaveAttribute('data-tone', 'gradient');
    expect(card).toHaveClass(
      'p-1',
      'bg-surface-elevated',
      'bg-linear-to-br',
      'from-accent-subtle'
    );

    // One link carries the full name and the changelog destination.
    const link = within(card).getByRole('link', {
      name: /What's new\s*Your latest releases/,
    });
    expect(link).toHaveAttribute('href', '/changelog');
    expect(link).toHaveAttribute('data-prefetch', 'false');
    // The link is the row: gutter, fixed icon column, right-aligned trailing.
    expect(link).toHaveAttribute('data-slot', 'inset-panel-row');
    expect(link).toHaveClass('h-8', 'px-(--space-2-5)');
    expect(link.querySelector('[data-slot="inset-panel-icon"]')).toHaveClass(
      'w-4',
      'shrink-0'
    );
    expect(
      link.querySelector('[data-slot="inset-panel-trailing"]')
    ).toHaveClass('ms-auto');
    await expectNoA11yViolations(container);

    fireEvent.click(
      within(card).getByRole('button', { name: "Dismiss what's new" })
    );
    expect(screen.queryByRole('region', { name: "What's New" })).toBeNull();
    expect(localStorage.getItem(sidebarDockSeenKey('one'))).toBe(release.id);
  });

  it('marks the release seen when the link is followed', () => {
    render(<SidebarDock userId='one' release={release} />);
    fireEvent.click(screen.getByRole('link', { name: /Your latest releases/ }));
    expect(localStorage.getItem(sidebarDockSeenKey('one'))).toBe(release.id);
  });

  it('hosts the update control in one fixed-height row on the panel', async () => {
    const onRestart = vi.fn();
    const { container } = render(
      <SidebarDock
        userId='one'
        updateControl={updateControl(
          { kind: 'ready', version: '2' },
          onRestart
        )}
      />
    );

    const card = screen.getByRole('region', { name: 'App Update' });
    expect(card).toHaveAttribute('data-slot', 'inset-panel');
    expect(card).toHaveAttribute('data-tone', 'gradient');

    // One fixed 32px region holds the updater control and sizes it to 32px.
    const slot = card.querySelector('[data-dock-update-slot]');
    expect(slot).toHaveClass('h-8', '[&>[data-desktop-update-control]]:h-8');
    expect(card.children).toHaveLength(1);
    expect(slot?.children).toHaveLength(1);
    expect(slot?.firstElementChild).toHaveAttribute(
      'data-desktop-update-control'
    );

    // The control's single action is the card's only button: no dismiss.
    const action = within(card).getByRole('button', {
      name: 'Restart to update',
    });
    expect(within(card).getAllByRole('button')).toEqual([action]);
    await expectNoA11yViolations(container);

    fireEvent.click(action);
    expect(onRestart).toHaveBeenCalledTimes(1);
  });

  it('keeps the update slot the same height across updater states', () => {
    const states: readonly DesktopUpdateControlState[] = [
      { kind: 'checking' },
      { kind: 'available', version: '2' },
      { kind: 'downloading', version: '2', percent: 42 },
      { kind: 'ready', version: '2' },
      { kind: 'failed', retry: 'check', version: '2' },
      { kind: 'offline' },
    ];
    for (const state of states) {
      const { unmount } = render(
        <SidebarDock userId='one' updateControl={updateControl(state)} />
      );
      const card = screen.getByRole('region', { name: 'App Update' });
      expect(card.children).toHaveLength(1);
      expect(card.querySelector('[data-dock-update-slot]')).toHaveClass('h-8');
      expect(
        card.querySelector('[data-desktop-update-control]')
      ).toHaveAttribute('data-state', state.kind);
      unmount();
      banner.dismiss();
    }
  });
});
