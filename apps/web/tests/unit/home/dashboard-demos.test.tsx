import { render, screen } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { DashboardLinksDemo } from '@/features/home/demo/DashboardLinksDemo';

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
});
