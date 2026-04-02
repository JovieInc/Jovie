import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DashboardHeader } from '@/features/dashboard/organisms/DashboardHeader';

describe('DashboardHeader', () => {
  it('renders shared status content ahead of the header action area', () => {
    const { container } = render(
      <DashboardHeader
        breadcrumbs={[{ label: 'Earnings', href: '/app/dashboard/earnings' }]}
        status={<div data-testid='header-status'>Syncing Music</div>}
        action={<button type='button'>Refresh</button>}
      />
    );

    const statusNodes = screen.getAllByTestId('header-status');
    const refreshButtons = screen.getAllByRole('button', { name: 'Refresh' });
    expect(statusNodes).toHaveLength(2);
    expect(refreshButtons).toHaveLength(2);

    const rightRail = container.querySelector(
      '.ml-auto.flex.items-center.gap-2'
    );
    expect(rightRail?.firstElementChild).toContainElement(statusNodes[1]);
  });
});
