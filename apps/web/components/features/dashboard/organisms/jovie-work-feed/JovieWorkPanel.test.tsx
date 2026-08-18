import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { useDashboardDataMock } = vi.hoisted(() => ({
  useDashboardDataMock: vi.fn(),
}));

vi.mock('@/app/app/(shell)/dashboard/DashboardDataContext', () => ({
  useDashboardData: useDashboardDataMock,
}));

vi.mock('./JovieWorkFeed', () => ({
  JovieWorkFeed: ({
    profileId,
    showHeader,
  }: {
    profileId: string;
    showHeader?: boolean;
  }) => (
    <div
      data-testid='jovie-work-feed-fixture'
      data-profile-id={profileId}
      data-show-header={String(showHeader)}
    />
  ),
}));

import { JovieWorkPanel } from './JovieWorkPanel';

describe('JovieWorkPanel', () => {
  beforeEach(() => {
    useDashboardDataMock.mockReset();
  });

  it('uses the canonical page and iconless profile empty-state anatomy', () => {
    useDashboardDataMock.mockReturnValue({ selectedProfile: null });

    render(<JovieWorkPanel />);

    expect(screen.getByTestId('jovie-work-page').tagName).toBe('SECTION');
    const emptyState = screen.getByTestId('jovie-work-profile-empty-state');
    expect(emptyState.tagName).toBe('OUTPUT');
    expect(emptyState.querySelector('svg')).toBeNull();
  });

  it('keeps the workspace heading singular when a profile is selected', () => {
    useDashboardDataMock.mockReturnValue({
      selectedProfile: { id: 'profile-123' },
    });

    render(<JovieWorkPanel />);

    expect(screen.getAllByText('Jovie Did This')).toHaveLength(1);
    expect(screen.getByTestId('jovie-work-feed-fixture')).toHaveAttribute(
      'data-profile-id',
      'profile-123'
    );
    expect(screen.getByTestId('jovie-work-feed-fixture')).toHaveAttribute(
      'data-show-header',
      'false'
    );
  });
});
