import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { DspPresenceSummary } from '@/features/dashboard/organisms/dsp-presence/DspPresenceSummary';
import type { EnrichmentStatus } from '@/lib/queries/useDspEnrichmentStatusQuery';

vi.mock('@/components/organisms/table', () => ({
  PageToolbar: ({ start, end }: { start: ReactNode; end: ReactNode }) => (
    <div>
      {start}
      {end}
    </div>
  ),
  PageToolbarActionButton: ({
    label,
    disabled,
    onClick,
  }: {
    label: string;
    disabled?: boolean;
    onClick?: () => void;
  }) => (
    <button type='button' disabled={disabled} onClick={onClick}>
      {label}
    </button>
  ),
}));

vi.mock('@/features/dashboard/atoms/DrawerToggleButton', () => ({
  DrawerToggleButton: () => <button type='button'>Toggle</button>,
}));

vi.mock(
  '@/features/dashboard/organisms/dsp-presence/AddPlatformDialog',
  () => ({
    AddPlatformDialog: () => null,
  })
);

vi.mock('@/lib/queries/useDspEnrichmentMutations', () => ({
  useTriggerDiscoveryMutation: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const discoveringStatus: EnrichmentStatus = {
  profileId: 'profile-123',
  overallPhase: 'discovering',
  overallProgress: 20,
  providers: [],
  discoveryStartedAt: '2026-03-30T00:00:00Z',
  discoveryCompletedAt: null,
  enrichmentStartedAt: null,
  enrichmentCompletedAt: null,
};

describe('DspPresenceSummary', () => {
  it('shows discovery progress and disables refresh while discovery is active', () => {
    render(
      <DspPresenceSummary
        confirmedCount={1}
        suggestedCount={2}
        existingProviderIds={[]}
        profileId='profile-123'
        isAdmin
        spotifyId='spotify-artist-123'
        enrichmentStatus={discoveringStatus}
      />
    );

    expect(screen.getByText('Discovering profiles...')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeDisabled();
  });
});
