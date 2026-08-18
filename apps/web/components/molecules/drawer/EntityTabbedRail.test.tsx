import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { EntityTabbedRail } from './EntityTabbedRail';

vi.mock('@/components/molecules/drawer/RightDrawer', () => ({
  RightDrawer: ({
    children,
    className,
    'data-testid': testId,
  }: {
    readonly children: ReactNode;
    readonly className?: string;
    readonly 'data-testid'?: string;
  }) => (
    <aside className={className} data-testid={testId ?? 'right-drawer'}>
      {children}
    </aside>
  ),
}));

const TABS = [
  { value: 'details' as const, label: 'Details' },
  { value: 'activity' as const, label: 'Activity' },
];

describe('EntityTabbedRail', () => {
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
