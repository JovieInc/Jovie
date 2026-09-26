import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  DashboardSegmentSkeleton,
  type DashboardSegmentSkeletonVariant,
} from './DashboardSegmentSkeleton';

const ROUTE_VARIANTS = ['admin', 'insights', 'profile', 'tour'] as const;
const ACCESSIBLE_LABELS = {
  admin: 'Loading admin',
  insights: 'Loading insights',
  profile: 'Loading artist profiles',
  tour: 'Loading tour dates',
} as const;

function geometrySignature(container: HTMLElement): string[] {
  return Array.from(
    container.querySelectorAll(
      '[data-skeleton-layout], [data-skeleton-slot], .skeleton'
    )
  ).map(element =>
    [
      element.tagName,
      element.getAttribute('data-skeleton-layout') ?? '',
      element.getAttribute('data-skeleton-slot') ?? '',
      element.getAttribute('class') ?? '',
    ].join('|')
  );
}

describe('DashboardSegmentSkeleton route variants', () => {
  it('uses the dashboard label for the default fallback', () => {
    render(<DashboardSegmentSkeleton />);

    expect(screen.getByTestId('dashboard-segment-skeleton')).toHaveAttribute(
      'aria-label',
      'Loading dashboard'
    );
  });

  it.each(
    ROUTE_VARIANTS
  )('exposes an accessible busy state for the %s route', variant => {
    render(<DashboardSegmentSkeleton variant={variant} />);

    const skeleton = screen.getByTestId('dashboard-segment-skeleton');
    expect(skeleton).toHaveAttribute('role', 'status');
    expect(skeleton).toHaveAttribute('aria-busy', 'true');
    expect(skeleton).toHaveAttribute('aria-live', 'polite');
    expect(skeleton).toHaveAttribute('aria-label', ACCESSIBLE_LABELS[variant]);
    expect(skeleton).toHaveAttribute('data-skeleton-variant', variant);
    expect(skeleton).toHaveClass('min-h-full', 'w-full');
  });

  it('reserves the admin health dashboard geometry (JOV-2098)', () => {
    const { container } = render(<DashboardSegmentSkeleton variant='admin' />);

    const health = container.querySelector(
      '[data-skeleton-slot="admin-health"]'
    );

    expect(health).toHaveClass(
      'grid-cols-1',
      'sm:grid-cols-2',
      'xl:grid-cols-4'
    );
    expect(health?.querySelectorAll('.min-h-28')).toHaveLength(4);
  });

  it('reserves fixed filter and result-card dimensions for insights', () => {
    const { container } = render(
      <DashboardSegmentSkeleton variant='insights' />
    );

    const filters = container.querySelector(
      '[data-skeleton-slot="insights-filters"]'
    );
    const cards = container.querySelector(
      '[data-skeleton-slot="insights-cards"]'
    );

    expect(filters).toHaveClass('min-h-8', 'flex-wrap');
    expect(filters?.querySelectorAll('.h-8')).toHaveLength(7);
    expect(cards?.querySelectorAll('.h-28')).toHaveLength(4);
  });

  it('matches the profile toolbar and 56px table-row rhythm', () => {
    const { container } = render(
      <DashboardSegmentSkeleton variant='profile' />
    );

    const filters = container.querySelector(
      '[data-skeleton-slot="profile-filters"]'
    );
    const table = container.querySelector(
      '[data-skeleton-slot="profile-table"]'
    );

    expect(filters).toHaveClass('min-h-10');
    expect(filters?.querySelectorAll('.h-7')).toHaveLength(5);
    expect(table?.firstElementChild).toHaveClass('h-10', 'grid-cols-12');
    expect(table?.querySelectorAll(':scope > .h-14')).toHaveLength(6);
    expect(table?.querySelectorAll('.hidden.sm\\:block')).toHaveLength(14);
  });

  it('reserves the touring status row and 40px table rhythm', () => {
    const { container } = render(<DashboardSegmentSkeleton variant='tour' />);

    const layout = container.querySelector('[data-skeleton-layout="tour"]');
    const status = container.querySelector(
      '[data-skeleton-slot="tour-status"]'
    );
    const table = container.querySelector('[data-skeleton-slot="tour-table"]');

    expect(layout).toHaveClass('flex', 'h-full', 'min-h-0', 'flex-col');
    expect(status).toHaveClass('h-11', 'shrink-0');
    expect(table).toHaveClass('min-h-0', 'flex-1', 'overflow-hidden');
    expect(table?.firstElementChild).toHaveClass('h-10', 'grid-cols-12');
    expect(table?.querySelectorAll(':scope > .h-10')).toHaveLength(11);
    expect(table?.querySelectorAll('.hidden.sm\\:block')).toHaveLength(33);
  });

  it.each(
    ROUTE_VARIANTS
  )('keeps the %s geometry deterministic when row keys change', (variant: DashboardSegmentSkeletonVariant) => {
    const { container, rerender } = render(
      <DashboardSegmentSkeleton variant={variant} rowKeyPrefix='first-render' />
    );
    const first = geometrySignature(container);

    rerender(
      <DashboardSegmentSkeleton
        variant={variant}
        rowKeyPrefix='second-render'
      />
    );

    expect(geometrySignature(container)).toEqual(first);
  });
});
