import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ReleasesClientBoundary } from '@/app/app/(shell)/dashboard/releases/ReleasesClientBoundary';

const clearPendingShell = vi.fn();

vi.mock('@/components/organisms/PendingShellContext', () => ({
  usePendingShell: () => ({
    clearPendingShell,
    pendingShellRoute: 'releases',
    showPendingShell: vi.fn(),
  }),
}));

describe('ReleasesClientBoundary', () => {
  it('renders children and clears the releases pending shell', () => {
    render(
      <ReleasesClientBoundary>
        <div>ready</div>
      </ReleasesClientBoundary>
    );

    expect(screen.getByText('ready')).toBeTruthy();
    expect(clearPendingShell).toHaveBeenCalledWith('releases');
  });
});
