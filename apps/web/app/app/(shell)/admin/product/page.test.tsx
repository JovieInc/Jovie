import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';

const requireCurrentAdminPageAccess = vi.fn();
const loadCapabilityEvidence = vi.fn();

vi.mock('@/lib/admin/page-access', () => ({ requireCurrentAdminPageAccess }));
vi.mock('@/lib/admin/capability-evidence', () => ({ loadCapabilityEvidence }));
vi.mock('@/components/features/admin/CapabilityEvidenceMatrix', () => ({
  CapabilityEvidenceMatrix: ({
    record,
    summary,
  }: {
    readonly record: unknown;
    readonly summary: string;
  }) => (
    <ContentSurfaceCard disclosure={{ label: 'Customer Experience', summary }}>
      <div data-testid='capability-evidence-matrix'>
        {JSON.stringify(record)}
      </div>
    </ContentSurfaceCard>
  ),
}));
vi.mock('@/components/features/admin/hud/OvieShippingStateCard', () => ({
  OvieShippingStateCard: ({ summary }: { readonly summary: string }) => (
    <ContentSurfaceCard disclosure={{ label: 'Shipping', summary }}>
      <div>Shipping state</div>
    </ContentSurfaceCard>
  ),
}));
vi.mock('@/components/features/admin/layout/AdminPage', () => ({
  AdminPage: ({ children }: { readonly children: ReactNode }) => (
    <main>{children}</main>
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

    expect(
      screen.queryByRole('list', { name: 'Product Delivery Lifecycle' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('capability-evidence-matrix')
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/version distribution is not observed/i)
    ).not.toBeInTheDocument();
    for (const name of [
      'Delivery Lifecycle',
      'Shipping',
      'Customer Experience',
      'Evidence Gaps',
    ]) {
      fireEvent.click(
        screen.getByRole('button', { name: new RegExp(`^${name}`) })
      );
    }

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
    expect(
      screen.getByRole('button', {
        name: 'Evidence Gaps · Two observations still need instrumentation',
      })
    ).toHaveAttribute('aria-expanded', 'true');
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
