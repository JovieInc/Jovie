import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import DashboardLoading from '@/app/app/(shell)/dashboard/loading';

vi.mock('next/headers', () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}));

describe('DashboardLoading', () => {
  it('renders a non-null dashboard skeleton while routes resolve', async () => {
    const { container } = render(await DashboardLoading());

    expect(container.firstChild).not.toBeNull();
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(container.querySelectorAll('.skeleton').length).toBeGreaterThan(0);
  });
});
