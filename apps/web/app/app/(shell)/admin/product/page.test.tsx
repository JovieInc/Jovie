import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireCurrentAdminPageAccess = vi.fn();
const loadCapabilityEvidence = vi.fn();

vi.mock('@/lib/admin/page-access', () => ({ requireCurrentAdminPageAccess }));
vi.mock('@/lib/admin/capability-evidence', () => ({ loadCapabilityEvidence }));
vi.mock('@/components/features/admin/CapabilityEvidenceMatrix', () => ({
  CapabilityEvidenceMatrix: ({ record }: { readonly record: unknown }) => (
    <div data-testid='capability-evidence-matrix'>{JSON.stringify(record)}</div>
  ),
}));
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

const evidenceRecord = { capabilityId: 'public-profile-pages' };

describe('founder product page', () => {
  beforeEach(() => {
    requireCurrentAdminPageAccess.mockReset();
    loadCapabilityEvidence.mockReset().mockResolvedValue(evidenceRecord);
  });

  it('gates access and exposes lifecycle evidence gaps and drill-downs', async () => {
    const { default: ProductPage } = await import('./page');

    render(await ProductPage());

    expect(requireCurrentAdminPageAccess).toHaveBeenCalledOnce();
    expect(loadCapabilityEvidence).toHaveBeenCalledOnce();
    expect(
      screen.getByRole('list', { name: 'Product Delivery Lifecycle' })
    ).toHaveTextContent(
      'Desired→Built→Certified→Deployed→Exposed→Observed→Healthy'
    );
    expect(screen.getByTestId('capability-evidence-matrix')).toHaveTextContent(
      'public-profile-pages'
    );
    expect(screen.getByText('Evidence Gaps')).toBeInTheDocument();
    expect(
      screen.getByText(/version distribution is not observed/i)
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Inspect feature state →' })
    ).toHaveAttribute('href', '/app/ov/features');
    expect(
      screen.getByRole('link', { name: 'Inspect release entities →' })
    ).toHaveAttribute('href', '/app/ov/releases');
  });
});
