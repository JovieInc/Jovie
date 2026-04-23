import { TooltipProvider } from '@jovie/ui';
import { render, screen } from '@testing-library/react';
import { NuqsTestingAdapter } from 'nuqs/adapters/testing';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { DashboardLinksDemo } from '@/features/home/demo/DashboardLinksDemo';
import { DashboardReleasesDemo } from '@/features/home/demo/DashboardReleasesDemo';

class MockIntersectionObserver {
  observe = vi.fn();
  disconnect = vi.fn();
  unobserve = vi.fn();
}

describe('Dashboard home demos', () => {
  const originalIntersectionObserver = globalThis.IntersectionObserver;

  beforeAll(() => {
    // @ts-expect-error - testing shim
    globalThis.IntersectionObserver = MockIntersectionObserver;
  });

  afterAll(() => {
    globalThis.IntersectionObserver = originalIntersectionObserver;
  });

  it('renders links demo with design-system utility classes', () => {
    const { container } = render(<DashboardLinksDemo />);

    expect(screen.getByText('Music Links')).toBeInTheDocument();
    expect(screen.getByText('+ Add link')).toBeInTheDocument();
    expect(container.querySelector('.bg-surface-0.border-subtle')).toBeTruthy();
  });

  it('renders releases demo using the real ReleaseTable with demo data', () => {
    const { container } = render(
      <NuqsTestingAdapter>
        <TooltipProvider>
          <DashboardReleasesDemo />
        </TooltipProvider>
      </NuqsTestingAdapter>
    );

    expect(container.querySelector('.bg-surface-0.border-subtle')).toBeTruthy();
    expect(container.querySelector('table')).toBeTruthy();
    expect(screen.getAllByRole('row').length).toBeGreaterThan(1);
  });
});
