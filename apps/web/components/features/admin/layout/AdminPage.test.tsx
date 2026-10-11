import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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
      screen.queryByText('Monitor the business at a glance.')
    ).not.toBeInTheDocument();

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
    expect(screen.queryByTestId('admin-page-toolbar')).not.toBeInTheDocument();
  });

  it('places page actions in the one canonical toolbar', () => {
    render(
      <AdminPage
        title='Ops'
        description='Metadata only.'
        actions={<button type='button'>Fullscreen</button>}
        testId='ops-page'
      >
        <p>Ops content</p>
      </AdminPage>
    );

    expect(screen.getByTestId('admin-page-toolbar')).toContainElement(
      screen.getByRole('button', { name: 'Fullscreen' })
    );
    expect(screen.queryByText('Metadata only.')).not.toBeInTheDocument();
    expect(screen.queryByTestId('admin-page-meta')).not.toBeInTheDocument();
  });
});

describe('JOV-5466 token retire', () => {
  it('does not keep retired --linear-app-* tokens', () => {
    const source = readFileSync(resolve(__dirname, './AdminPage.tsx'), 'utf8');
    expect(source).not.toMatch(/--linear-app-/);
  });
});
