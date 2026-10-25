import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { EntityTabbedRail } from './EntityTabbedRail';

vi.mock('@/components/molecules/drawer/RightDrawer', () => ({
  RightDrawer: ({
    children,
    className,
    id,
    width,
    onKeyDown,
    'data-testid': testId,
  }: {
    readonly children: ReactNode;
    readonly className?: string;
    readonly id?: string;
    readonly width?: number;
    readonly onKeyDown?: (event: KeyboardEvent) => void;
    readonly 'data-testid'?: string;
  }) => (
    <aside
      id={id}
      className={className}
      style={{ width }}
      onKeyDown={event => onKeyDown?.(event.nativeEvent)}
      data-testid={testId ?? 'right-drawer'}
    >
      {children}
    </aside>
  ),
}));

const TABS = [
  { value: 'details' as const, label: 'Details' },
  { value: 'activity' as const, label: 'Activity' },
];

describe('EntityTabbedRail', () => {
  it('retains entity targeting, width, dismissal and tab actions in the shared shell', async () => {
    const addLink = vi.fn();
    const onKeyDown = vi.fn();
    const onTabChange = vi.fn();
    const { container } = render(
      <EntityTabbedRail
        id='shell-artist-profile-rail'
        width={344}
        onKeyDown={onKeyDown}
        isOpen
        ariaLabel='Profile details'
        activeTab='details'
        onTabChange={onTabChange}
        tabOptions={TABS}
        tabsAriaLabel='Profile tabs'
        tabActions={
          <button type='button' onClick={addLink}>
            Add link
          </button>
        }
        tabbedCardTestId='profile-card'
      >
        <input aria-label='Bio' defaultValue='Unsaved bio' />
      </EntityTabbedRail>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add link' }));
    expect(addLink).toHaveBeenCalledOnce();
    expect(onTabChange).not.toHaveBeenCalled();
    expect(screen.getByRole('tab', { name: 'Details' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(screen.getByRole('textbox', { name: 'Bio' })).toHaveValue(
      'Unsaved bio'
    );
    const rail = screen.getByTestId('right-drawer');
    expect(rail).toHaveAttribute('id', 'shell-artist-profile-rail');
    expect(rail).toHaveStyle({ width: '344px' });
    expect(rail.querySelector('[data-scroll-strategy]')).toHaveAttribute(
      'data-scroll-strategy',
      'child'
    );
    expect(
      screen.getByTestId('profile-card-scroll-region')
    ).not.toContainElement(screen.getByRole('tablist'));
    fireEvent.keyDown(rail, { key: 'Escape' });
    expect(onKeyDown).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'Escape' })
    );
    await expectNoA11yViolations(container);
  });

  it('inherits canonical drawer geometry while keeping rail content flat', async () => {
    const onTabChange = vi.fn();
    const { container } = render(
      <EntityTabbedRail
        isOpen
        ariaLabel='Audience member details'
        activeTab='details'
        onTabChange={onTabChange}
        tabOptions={TABS}
        tabsAriaLabel='Audience tabs'
        entityHeader={<div>Entity identity</div>}
        tabbedCardTestId='entity-tabbed-card'
        testId='entity-rail'
      >
        <div>Entity details</div>
      </EntityTabbedRail>
    );

    const rail = screen.getByTestId('entity-rail');
    const workspace = rail.querySelector('[data-right-rail-workspace]');

    expect(rail).not.toHaveAttribute('class');
    expect(workspace).toHaveAttribute('data-surface-variant', 'flat');
    expect(screen.getByTestId('entity-sidebar-entity-header')).toHaveAttribute(
      'data-surface-variant',
      'flat'
    );
    expect(screen.getByTestId('entity-tabbed-card')).toHaveAttribute(
      'data-surface-variant',
      'flat'
    );
    expect(
      container.querySelectorAll('[data-surface-variant="card"]')
    ).toHaveLength(0);

    fireEvent.click(screen.getByRole('tab', { name: 'Activity' }));
    expect(onTabChange).toHaveBeenCalledWith('activity');
    await expectNoA11yViolations(container);
  });

  it('opts the tabbed card into the shared rounded drawer card without raising the rail', () => {
    render(
      <EntityTabbedRail
        isOpen
        ariaLabel='Analytics'
        activeTab='details'
        onTabChange={() => undefined}
        tabOptions={TABS}
        tabsAriaLabel='Analytics tabs'
        tabbedCardTestId='analytics-tabbed-card'
        tabbedSurfaceVariant='card'
        testId='analytics-rail'
      >
        <div>Ranked cities</div>
      </EntityTabbedRail>
    );

    const rail = screen.getByTestId('analytics-rail');
    expect(rail.querySelector('[data-right-rail-workspace]')).toHaveAttribute(
      'data-surface-variant',
      'flat'
    );
    const card = screen.getByTestId('analytics-tabbed-card');
    expect(card).toHaveAttribute('data-surface-variant', 'card');
    expect(card.className).toContain('rounded-lg');
  });

  it('places the empty state directly on the flat rail and omits tab chrome', () => {
    const { container } = render(
      <EntityTabbedRail
        isOpen
        ariaLabel='Empty contact details'
        activeTab='details'
        onTabChange={() => undefined}
        tabOptions={TABS}
        tabsAriaLabel='Contact tabs'
        isEmpty
        emptyMessage='Select a contact to view details.'
      >
        <div>Hidden details</div>
      </EntityTabbedRail>
    );

    expect(
      screen.getByText('Select a contact to view details.')
    ).toBeInTheDocument();
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    expect(screen.queryByText('Hidden details')).not.toBeInTheDocument();
    expect(
      container.querySelectorAll('[data-surface-variant="card"]')
    ).toHaveLength(0);
  });
});
