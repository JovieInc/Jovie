import { TooltipProvider } from '@jovie/ui';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ReleasePropertiesPanel } from './ReleasePropertiesPanel';
import type { Release } from './types';

vi.mock('./release-credits-action', () => ({
  fetchReleaseCreditsAction: vi.fn().mockResolvedValue([]),
}));

function buildRelease(overrides: Partial<Release> = {}): Release {
  return {
    profileId: 'profile_1',
    id: 'release_1',
    title: 'Midnight Echo',
    releaseDate: '2025-06-01T00:00:00.000Z',
    artworkUrl: 'https://example.com/artwork.jpg',
    slug: 'midnight-echo',
    smartLinkPath: '/r/midnight-echo--profile_1',
    spotifyPopularity: 72,
    providers: [],
    releaseType: 'single',
    isExplicit: false,
    upc: '123456789012',
    label: 'North Star Records',
    totalTracks: 1,
    totalDurationMs: 185000,
    primaryIsrc: 'USRC17607839',
    genres: ['Indie Pop'],
    canvasStatus: 'not_set',
    ...overrides,
  };
}

describe('ReleasePropertiesPanel', () => {
  it('shows the release properties under one Properties section', async () => {
    const { container } = render(
      <TooltipProvider>
        <ReleasePropertiesPanel
          release={buildRelease()}
          isEditable={false}
          showCredits={false}
        />
      </TooltipProvider>
    );

    expect(screen.getByTestId('release-properties-card')).toHaveTextContent(
      'Properties'
    );
    expect(screen.getByText('North Star Records')).toBeInTheDocument();
    expect(screen.getByText('USRC17607839')).toBeInTheDocument();
    expect(screen.queryByTestId('release-credits-card')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('saves an edited label through onSaveMetadata', async () => {
    const user = userEvent.setup();
    const onSaveMetadata = vi.fn().mockResolvedValue(undefined);
    const { container } = render(
      <TooltipProvider>
        <ReleasePropertiesPanel
          release={buildRelease({ label: null })}
          isEditable
          showCredits={false}
          onSaveMetadata={onSaveMetadata}
          onSavePrimaryIsrc={vi.fn().mockResolvedValue(undefined)}
        />
      </TooltipProvider>
    );

    await user.click(screen.getByRole('button', { name: /Edit Label/ }));
    const input = screen.getByLabelText('Edit Label');
    await user.type(input, 'New Label');
    expect(input).toHaveValue('New Label');
    await user.tab();

    await waitFor(() =>
      expect(onSaveMetadata).toHaveBeenCalledWith('release_1', {
        upc: '123456789012',
        label: 'New Label',
      })
    );
    await expectNoA11yViolations(container);
  });

  it('saves an edited ISRC through onSavePrimaryIsrc', async () => {
    const user = userEvent.setup();
    const onSavePrimaryIsrc = vi.fn().mockResolvedValue(undefined);
    render(
      <TooltipProvider>
        <ReleasePropertiesPanel
          release={buildRelease({ primaryIsrc: null })}
          isEditable
          showCredits={false}
          onSaveMetadata={vi.fn().mockResolvedValue(undefined)}
          onSavePrimaryIsrc={onSavePrimaryIsrc}
        />
      </TooltipProvider>
    );

    await user.click(screen.getByRole('button', { name: /Edit ISRC/ }));
    await user.type(screen.getByLabelText('Edit ISRC'), 'USRC17607840');
    await user.tab();

    await waitFor(() =>
      expect(onSavePrimaryIsrc).toHaveBeenCalledWith(
        'release_1',
        'USRC17607840'
      )
    );
  });

  it('includes the credits section by default', async () => {
    const { container } = render(
      <TooltipProvider>
        <ReleasePropertiesPanel release={buildRelease()} isEditable={false} />
      </TooltipProvider>
    );

    expect(screen.getByTestId('release-properties-card')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
