import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { AdminPage } from './AdminPage';

const push = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({
  usePathname: () => '/app/admin/overview',
  useSearchParams: () => new URLSearchParams('view=scoreboard'),
  useRouter: () => ({ push, replace: push }),
}));

describe('AdminPage certificate', () => {
  beforeEach(() => push.mockReset());

  it('is axe-clean as a bare document page', async () => {
    const { container } = render(
      <AdminPage title='Report' testId='report-page'>
        <p>Report content</p>
      </AdminPage>
    );

    expect(screen.getByTestId('report-page')).toHaveAttribute(
      'data-admin-layout',
      'document'
    );
    expect(screen.queryByTestId('admin-page-toolbar')).toBeNull();
    expect(screen.queryByTestId('admin-page-hero')).toBeNull();
    expect(screen.queryByRole('tablist')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('is axe-clean with a toolbar, route views, a hero and an action', async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    const { container } = render(
      <AdminPage
        title='Product'
        testId='product-page'
        viewTestId='product-view'
        views='shipping'
        hero={<section aria-label='Key Metrics'>Revenue metrics</section>}
        actions={
          <button type='button' onClick={onAction}>
            Refresh
          </button>
        }
        className='custom-page'
      >
        <p>Product content</p>
      </AdminPage>
    );

    const toolbar = screen.getByTestId('admin-page-toolbar');
    expect(
      within(toolbar).getByRole('tablist', { name: 'Shipping Views' })
    ).toBeInTheDocument();
    expect(screen.getByTestId('product-page')).toHaveClass('custom-page');
    expect(screen.getByTestId('product-view')).toHaveTextContent(
      'Product content'
    );
    await user.click(within(toolbar).getByRole('button', { name: 'Refresh' }));
    expect(onAction).toHaveBeenCalledOnce();
    await expectNoA11yViolations(container);
  });

  it('is axe-clean with headerless tabs in workspace layout', async () => {
    const { container } = render(
      <AdminPage
        title='Overview'
        layout='workspace'
        testId='overview-page'
        viewTestId='overview-view'
        tabs={{
          param: 'view',
          value: 'scoreboard',
          options: [
            { value: 'scoreboard', label: 'Scoreboard' },
            { value: 'workspaces', label: 'Workspaces' },
          ],
        }}
      >
        <p>Overview content</p>
      </AdminPage>
    );

    const tabs = screen.getByRole('tablist', {
      name: 'Overview primary views',
    });
    expect(
      within(tabs).getByRole('tab', { name: 'Scoreboard' })
    ).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('overview-page')).toHaveClass('overflow-hidden');
    expect(screen.queryByRole('heading', { name: 'Overview' })).toBeNull();
    await expectNoA11yViolations(container);
  });
});
