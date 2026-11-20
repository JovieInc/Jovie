import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ADMIN_VIEW_GROUPS } from '@/constants/admin-navigation';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { AdminRouteViews } from './AdminRouteViews';

const pathnameMock = vi.hoisted(() => vi.fn(() => '/app/ov/shipping'));
const push = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({
  usePathname: () => pathnameMock(),
  useRouter: () => ({ push }),
}));

describe('AdminRouteViews certificate', () => {
  beforeEach(() => {
    push.mockReset();
  });

  it.each(['shipping', 'operations'] as const)(
    'renders every %s view with one selected, axe-clean',
    async group => {
      const { label, views } = ADMIN_VIEW_GROUPS[group];
      pathnameMock.mockReturnValue(`${views[1].href}/detail`);
      const { container } = render(<AdminRouteViews group={group} />);

      expect(screen.getByRole('tablist', { name: label })).toBeInTheDocument();
      const tabs = screen.getAllByRole('tab');
      expect(tabs.map(tab => tab.textContent)).toEqual(
        views.map(view => view.label)
      );
      expect(
        tabs.filter(tab => tab.getAttribute('aria-selected') === 'true')
      ).toHaveLength(1);
      expect(screen.getByRole('tab', { name: views[1].label })).toHaveAttribute(
        'aria-selected',
        'true'
      );
      await expectNoA11yViolations(container);
    }
  );

  it('selects the first view for a route outside the group, axe-clean', async () => {
    pathnameMock.mockReturnValue('/app/ov/elsewhere');
    const { container } = render(<AdminRouteViews group='shipping' />);

    expect(
      screen.getByRole('tab', {
        name: ADMIN_VIEW_GROUPS.shipping.views[0].label,
      })
    ).toHaveAttribute('aria-selected', 'true');
    await expectNoA11yViolations(container);
  });
});
