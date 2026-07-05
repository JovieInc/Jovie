import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import DashboardLoading from '@/app/app/(shell)/dashboard/loading';

describe('DashboardLoading', () => {
  it('renders a non-null dashboard skeleton while routes resolve', () => {
    const { container } = render(<DashboardLoading />);

    expect(container.firstChild).not.toBeNull();
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(container.querySelectorAll('.skeleton').length).toBeGreaterThan(0);
  });
});
