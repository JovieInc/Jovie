import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AdminPage } from './AdminPage';

vi.mock('next/navigation', () => ({
  usePathname: () => '/app/admin/overview',
  useSearchParams: () => new URLSearchParams('view=scoreboard'),
}));

describe('AdminPage', () => {
  it('renders hero metrics and headerless tabs without duplicating the shell title', () => {
    render(
      <AdminPage
        title='Overview'
        description='Monitor the business at a glance.'
        hero={<section aria-label='Key Metrics'>Revenue metrics</section>}
        tabs={{
          param: 'view',
          value: 'scoreboard',
          options: [
            { value: 'scoreboard', label: 'Scoreboard' },
            { value: 'workspaces', label: 'Workspaces' },
          ],
        }}
        testId='admin-overview-page'
        viewTestId='admin-overview-view'
      >
        <p>Overview content</p>
      </AdminPage>
    );

    expect(screen.getByTestId('admin-page-hero')).toContainElement(
      screen.getByRole('region', { name: 'Key Metrics' })
    );
    expect(
      screen.getAllByText('Monitor the business at a glance.')
    ).toHaveLength(1);

    const tabs = screen.getByRole('tablist', {
      name: 'Overview primary views',
    });
    expect(
      within(tabs).getByRole('tab', { name: 'Scoreboard' })
    ).toHaveAttribute('aria-selected', 'true');
    expect(
      within(tabs).getByRole('tab', { name: 'Workspaces' })
    ).toHaveAttribute('aria-selected', 'false');

    expect(
      screen.queryByRole('heading', { name: 'Overview' })
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Overview')).not.toBeInTheDocument();
    expect(screen.getByTestId('admin-overview-view')).toHaveTextContent(
      'Overview content'
    );
  });
});
