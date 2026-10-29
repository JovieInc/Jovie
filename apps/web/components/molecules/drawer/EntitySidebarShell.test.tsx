import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { EntitySidebarShell } from './EntitySidebarShell';

vi.mock('@/components/molecules/drawer/RightDrawer', () => ({
  RightDrawer: ({
    children,
    ariaLabel,
    onKeyDown,
  }: {
    readonly children: ReactNode;
    readonly ariaLabel?: string;
    readonly onKeyDown?: (event: KeyboardEvent) => void;
  }) => (
    <aside
      data-testid='right-drawer'
      aria-label={ariaLabel}
      onKeyDown={event => onKeyDown?.(event.nativeEvent)}
    >
      {children}
    </aside>
  ),
}));

const TABS = (
  <div role='tablist' aria-label='Entity tabs'>
    <button type='button' role='tab' aria-selected='true'>
      Overview
    </button>
  </div>
);

describe('EntitySidebarShell', () => {
  it('renders the standard chrome: title bar, pinned entity header, tabs, body', async () => {
    const { container } = render(
      <EntitySidebarShell
        isOpen
        ariaLabel='Release details'
        title='Release details'
        entityHeader={<div data-testid='fixture-entity-header'>Afterglow</div>}
        tabs={TABS}
        onClose={vi.fn()}
      >
        <div data-testid='fixture-body'>Inspector content</div>
      </EntitySidebarShell>
    );
    expect(screen.getByText('Release details')).toBeInTheDocument();
    expect(screen.getByTestId('fixture-entity-header')).toBeInTheDocument();
    expect(screen.getByTestId('fixture-body')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('keeps one card seam: the nested tab divider is transparent, not a second border', () => {
    render(
      <EntitySidebarShell
        isOpen
        ariaLabel='Release details'
        title='Release details'
        tabs={TABS}
        onClose={vi.fn()}
      >
        <div>Inspector content</div>
      </EntitySidebarShell>
    );
    const divider = screen.getByRole('tablist').parentElement;
    expect(divider?.className).toContain('border-t');
    expect(divider?.className).toContain('border-transparent');
    expect(divider?.className).not.toContain('border-(--app-shell-frame-seam)');
  });

  it('shows the empty state instead of the entity and tabs', async () => {
    const { container } = render(
      <EntitySidebarShell
        isOpen
        ariaLabel='Release details'
        title='Release details'
        isEmpty
        emptyMessage='Select a release to see details.'
      >
        <div data-testid='fixture-body'>Inspector content</div>
      </EntitySidebarShell>
    );
    expect(
      screen.getByText('Select a release to see details.')
    ).toBeInTheDocument();
    expect(screen.queryByTestId('fixture-body')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('closes on Escape through the shell keyboard handler', () => {
    const onClose = vi.fn();
    render(
      <EntitySidebarShell
        isOpen
        ariaLabel='Release details'
        title='Release details'
        onClose={onClose}
      >
        <div>Inspector content</div>
      </EntitySidebarShell>
    );
    fireEvent.keyDown(screen.getByTestId('right-drawer'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });
});
