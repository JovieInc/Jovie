import { render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CAPABILITY_EVIDENCE_FIXTURE } from '@/lib/admin/capability-evidence-fixtures';

const requireCurrentAdminPageAccess = vi.fn();
const loadCapabilityEvidence = vi.fn();

vi.mock('@/lib/admin/page-access', () => ({ requireCurrentAdminPageAccess }));
vi.mock('@/lib/admin/capability-evidence', () => ({ loadCapabilityEvidence }));
vi.mock('@/components/features/admin/CapabilityEvidenceMatrix', () => ({
  CapabilityEvidenceMatrix: ({
    record,
  }: {
    readonly record: { readonly capabilityId: string };
  }) => (
    <div data-testid='capability-evidence-matrix'>{record.capabilityId}</div>
  ),
}));
vi.mock('@/components/features/admin/layout/AdminPage', () => ({
  AdminPage: ({
    children,
    views,
  }: {
    readonly children: ReactNode;
    readonly views?: string;
  }) => <main data-views={views}>{children}</main>,
}));

describe('founder product page', () => {
  beforeEach(() => {
    requireCurrentAdminPageAccess.mockReset();
    loadCapabilityEvidence
      .mockReset()
      .mockResolvedValue(CAPABILITY_EVIDENCE_FIXTURE);
  });

  it('uses the Shipping route views instead of in-page text tabs', async () => {
    const { default: ProductPage } = await import('./page');
    const { container } = render(await ProductPage());

    expect(requireCurrentAdminPageAccess).toHaveBeenCalledOnce();
    expect(container.querySelector('main')).toHaveAttribute(
      'data-views',
      'shipping'
    );
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });

  it('shows every lifecycle stage with its evidenced state and reading', async () => {
    const { default: ProductPage } = await import('./page');
    render(await ProductPage());

    const lifecycle = screen.getByRole('list', {
      name: 'Product Delivery Lifecycle',
    });
    const stages = within(lifecycle).getAllByRole('listitem');
    expect(stages.map(stage => stage.getAttribute('data-state'))).toEqual([
      'done',
      'done',
      'current',
      'done',
      'done',
      'done',
      'done',
    ]);
    expect(lifecycle).toHaveTextContent('review ready');
    expect(lifecycle).toHaveTextContent('1.2.3 bbbbbbb');
    expect(lifecycle).toHaveTextContent('128 in 7d');
    expect(lifecycle).toHaveTextContent('41 in 7d');
    expect(lifecycle).not.toHaveTextContent(/→|n\/a/);
  });

  it('keeps evidence gaps and drill-downs', async () => {
    const { default: ProductPage } = await import('./page');
    render(await ProductPage());

    expect(screen.getByTestId('capability-evidence-matrix')).toHaveTextContent(
      'public-profile-pages'
    );
    expect(
      screen.getByRole('heading', { name: 'Evidence Gaps' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Inspect feature state →' })
    ).toHaveAttribute('href', '/app/ov/features');
    expect(
      screen.getByRole('link', { name: 'Inspect release entities →' })
    ).toHaveAttribute('href', '/app/ov/releases');
  });
});
