import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ReleasesClientBoundary } from '@/app/app/(shell)/dashboard/releases/ReleasesClientBoundary';

const clearPendingShell = vi.fn();

vi.mock('@/components/organisms/AuthShellWrapper', () => ({
  usePendingShell: () => ({
    clearPendingShell,
    pendingShellRoute: 'releases',
    showPendingShell: vi.fn(),
  }),
}));

vi.mock('@/lib/queries', () => ({
  QueryErrorBoundary: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

describe('ReleasesClientBoundary', () => {
  it('renders children through the query error boundary', () => {
    render(
      <ReleasesClientBoundary>
        <div>ready</div>
      </ReleasesClientBoundary>
    );

    expect(screen.getByText('ready')).toBeTruthy();
    expect(clearPendingShell).toHaveBeenCalledWith('releases');
  });
});
