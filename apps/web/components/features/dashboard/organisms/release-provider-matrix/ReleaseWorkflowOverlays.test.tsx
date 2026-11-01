import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ReleaseWorkflowOverlays } from './ReleaseWorkflowOverlays';
import meta from './ReleaseWorkflowOverlays.stories';

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

const props = meta.args;

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
