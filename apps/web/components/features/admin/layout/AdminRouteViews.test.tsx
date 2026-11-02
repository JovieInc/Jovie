import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { activeAdminView } from '@/constants/admin-navigation';
import { AdminRouteViews } from './AdminRouteViews';

const pathnameMock = vi.hoisted(() => vi.fn(() => '/app/ov/shipping'));
const push = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({
  usePathname: () => pathnameMock(),
  useRouter: () => ({ push }),
}));

describe('AdminRouteViews', () => {
  beforeEach(() => {
    push.mockReset();
    pathnameMock.mockReturnValue('/app/ov/shipping');
  });

  it('renders the Shipping views through the canonical segment control', () => {
    pathnameMock.mockReturnValue('/app/ov/product');
    render(<AdminRouteViews group='shipping' />);
    expect(
      screen.getByRole('tablist', { name: 'Shipping Views' })
    ).toBeInTheDocument();
    expect(screen.getAllByRole('tab').map(tab => tab.textContent)).toEqual([
      'Pipeline',
      'Product',
      'Timeline',
    ]);
    expect(screen.getByRole('tab', { name: 'Product' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
  });

  it('resolves nested routes to their view and falls back to the first', () => {
    expect(activeAdminView('shipping', '/app/ov/activity/123')).toBe(
      '/app/ov/activity'
    );
    expect(activeAdminView('operations', '/app/ov/elsewhere')).toBe(
      '/app/ov/operations'
    );
  });
});
