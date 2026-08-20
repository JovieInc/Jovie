import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/components/features/admin/layout/AdminPage', () => ({
  AdminPage: ({
    children,
    title,
    testId,
    viewTestId,
  }: {
    children: ReactNode;
    title: string;
    testId: string;
    viewTestId: string;
  }) => (
    <section data-testid={testId} data-page-title={title}>
      <div data-testid={viewTestId}>{children}</div>
    </section>
  ),
}));

import ScreenshotsLoading from '@/app/app/(shell)/admin/screenshots/loading';
import { ScreenshotGallerySkeleton } from '@/app/app/(shell)/admin/screenshots/ScreenshotGallerySkeleton';

describe('admin screenshots loading anatomy', () => {
  it('renders the complete responsive gallery placeholder', () => {
    render(<ScreenshotGallerySkeleton />);

    expect(screen.getByTestId('admin-screenshots-skeleton')).toHaveClass(
      'sm:grid-cols-2',
      'lg:grid-cols-3',
      'xl:grid-cols-4'
    );
    expect(
      screen.getAllByTestId('admin-screenshots-skeleton-card')
    ).toHaveLength(8);
  });

  it('keeps the loading route inside the canonical AdminPage shell', () => {
    render(<ScreenshotsLoading />);

    expect(screen.getByTestId('admin-screenshots-loading')).toHaveAttribute(
      'data-page-title',
      'Screenshots'
    );
    expect(
      screen.getByTestId('admin-screenshots-loading-content')
    ).toContainElement(screen.getByTestId('admin-screenshots-skeleton'));
    expect(screen.queryByRole('heading', { name: 'Screenshots' })).toBeNull();
  });
});
