import { render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ReleaseWorkflowOverlays } from './ReleaseWorkflowOverlays';

vi.mock('./release-lazy-components', () => ({
  SpotifyConnectDialog: ({
    connected,
    connectedArtistName,
  }: {
    connected?: boolean;
    connectedArtistName?: string | null;
  }) => (
    <div data-testid='spotify-connection' data-connected={String(connected)}>
      {connectedArtistName}
    </div>
  ),
  ArtistSearchCommandPalette: () => null,
  ReleasePlanWizard: () => null,
}));

const props: ComponentProps<typeof ReleaseWorkflowOverlays> = {
  amPaletteOpen: false,
  setAmPaletteOpen: vi.fn(),
  spotifySearchOpen: true,
  setSpotifySearchOpen: vi.fn(),
  onAppleMusicConnect: vi.fn(),
  onSpotifyConnected: vi.fn(),
  onSpotifyImportStart: vi.fn(),
  postCreateRelease: null,
  isPostCreatePlanModalOpen: false,
  isReleasePlanGateLoading: false,
  canGenerateReleasePlans: false,
  isGeneratingReleasePlan: false,
  closePostCreatePlanModal: vi.fn(),
  onGenerateReleasePlan: vi.fn(),
  deleteTarget: null,
  isDeleting: false,
  closeDeleteDialog: vi.fn(),
  onDeleteConfirm: vi.fn(),
};

describe('ReleaseWorkflowOverlays connection state', () => {
  it.each([true, false])(
    'passes resolved connection %s to the dialog',
    connected => {
      render(
        <ReleaseWorkflowOverlays
          {...props}
          spotifyConnected={connected}
          spotifyArtistName='Tim White'
        />
      );
      expect(screen.getByTestId('spotify-connection')).toHaveAttribute(
        'data-connected',
        String(connected)
      );
      expect(screen.getByTestId('spotify-connection')).toHaveTextContent(
        'Tim White'
      );
    }
  );
});
