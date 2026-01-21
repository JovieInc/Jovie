import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DashboardOverviewSkeleton } from '@/components/dashboard/organisms/DashboardOverviewSkeleton';

describe('DashboardOverviewSkeleton', () => {
  it('renders the overview skeleton structure', () => {
    const { container } = render(<DashboardOverviewSkeleton />);

    const skeleton = screen.getByTestId('dashboard-overview-skeleton');
    expect(skeleton).toHaveAttribute('aria-busy', 'true');

    const sections = container.querySelectorAll('section');
    expect(sections.length).toBe(2);
  });
});
