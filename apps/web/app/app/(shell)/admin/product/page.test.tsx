import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireCurrentAdminPageAccess = vi.fn();

vi.mock('@/lib/admin/page-access', () => ({ requireCurrentAdminPageAccess }));
vi.mock('@/components/features/admin/hud/OvieShippingStateCard', () => ({
  OvieShippingStateCard: () => <div>Shipping state</div>,
}));
vi.mock('@/components/features/admin/layout/AdminPage', () => ({
  AdminPage: ({ children }: { readonly children: ReactNode }) => (
    <main>{children}</main>
  ),
}));
vi.mock('@/components/molecules/ContentSurfaceCard', () => ({
  ContentSurfaceCard: ({ children }: { readonly children: ReactNode }) => (
    <section>{children}</section>
  ),
}));

describe('founder product page', () => {
  beforeEach(() => requireCurrentAdminPageAccess.mockReset());

  it('gates access and exposes lifecycle evidence gaps and drill-downs', async () => {
    const { default: ProductPage } = await import('./page');

    render(await ProductPage());

    expect(requireCurrentAdminPageAccess).toHaveBeenCalledOnce();
    expect(
      screen.getByRole('list', { name: 'Product Delivery Lifecycle' })
    ).toHaveTextContent(
      'Desired→Built→Certified→Deployed→Exposed→Observed→Healthy'
    );
    expect(screen.getByText('Evidence Gaps')).toBeInTheDocument();
    expect(
      screen.getByText(
        /user exposure counts and outcomes are not yet measured/i
      )
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Review certifications →' })
    ).toHaveAttribute('href', '/app/ov/certifications');
    expect(
      screen.getByRole('link', { name: 'Inspect release entities →' })
    ).toHaveAttribute('href', '/app/ov/releases');
  });
});
