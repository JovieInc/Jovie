import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const pathnameMock = vi.hoisted(() => vi.fn(() => '/app/ov/operations'));

vi.mock('next/navigation', () => ({
  usePathname: () => pathnameMock(),
  useRouter: () => ({ push: vi.fn() }),
}));

// JOV-12641: the admin loading boundary is the nearest loading state for
// Fleet view switches. The Health / Agents / Room navigation must stay
// mounted with the same toolbar geometry while the boundary shows pending
// state — on the old behavior this file rendered no navigation at all, so
// the Fleet controls vanished during every switch.
describe('AdminLoading (Fleet navigation boundary)', () => {
  it('keeps the Fleet navigation mounted while the boundary shows pending state', async () => {
    const { default: AdminLoading } = await import(
      '@/app/app/(shell)/admin/loading'
    );
    render(<AdminLoading />);

    const nav = screen.getByRole('tablist', { name: 'Fleet Views' });
    expect(nav).toBeVisible();
    expect(screen.getByRole('tab', { name: 'Health' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(screen.getByRole('tab', { name: 'Agents' })).toBeVisible();
    expect(screen.getByRole('tab', { name: 'Room' })).toBeVisible();
  });

  it('renders the same canonical admin toolbar the Fleet pages render', async () => {
    const { default: AdminLoading } = await import(
      '@/app/app/(shell)/admin/loading'
    );
    render(<AdminLoading />);
    expect(screen.getByTestId('admin-page-toolbar')).toBeVisible();
  });
});
