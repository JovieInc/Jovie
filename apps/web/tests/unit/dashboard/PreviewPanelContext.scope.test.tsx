import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  PreviewPanelProvider,
  usePreviewPanelData,
  usePreviewPanelState,
} from '@/app/app/(shell)/dashboard/PreviewPanelContext';

/**
 * JOV-7150 regression fixture: the profile rail must never carry open into
 * a surface where the user did not explicitly open it. An open rail on the
 * dashboard previously persisted into empty chat because the provider
 * survived the route change.
 */
function RailProbe() {
  const { isOpen, open } = usePreviewPanelState();
  const { previewData } = usePreviewPanelData();

  return (
    <div>
      <div data-testid='rail-open'>{String(isOpen)}</div>
      <div data-testid='rail-data'>
        {previewData ? previewData.username : 'none'}
      </div>
      <button data-testid='open-rail' onClick={open} type='button'>
        open rail
      </button>
    </div>
  );
}

function renderShell(scope: string) {
  return render(
    <PreviewPanelProvider scope={scope}>
      <RailProbe />
    </PreviewPanelProvider>
  );
}

describe('PreviewPanelProvider scope reset (JOV-7150)', () => {
  it('starts closed', () => {
    renderShell('chat');
    expect(screen.getByTestId('rail-open').textContent).toBe('false');
  });

  it('closes the rail when the surface scope changes to chat', () => {
    const { rerender } = renderShell('app-shell');

    // Simulate an explicit user open on the dashboard surface.
    fireEvent.click(screen.getByTestId('open-rail'));
    expect(screen.getByTestId('rail-open').textContent).toBe('true');

    // Same scope keeps the rail open.
    rerender(
      <PreviewPanelProvider scope='app-shell'>
        <RailProbe />
      </PreviewPanelProvider>
    );
    expect(screen.getByTestId('rail-open').textContent).toBe('true');

    // Entering chat resets it — no unsolicited rail on the empty state.
    rerender(
      <PreviewPanelProvider scope='chat'>
        <RailProbe />
      </PreviewPanelProvider>
    );
    expect(screen.getByTestId('rail-open').textContent).toBe('false');
  });

  it('drops hydrated preview data when the scope changes', () => {
    function DataProbe() {
      const { setPreviewData } = usePreviewPanelData();
      return (
        <button
          data-testid='hydrate'
          onClick={() =>
            setPreviewData({
              username: 'timwhite',
              displayName: 'Tim White',
              avatarUrl: null,
              bio: null,
              genres: null,
              location: null,
              hometown: null,
              activeSinceYear: null,
              links: [],
              profilePath: '/timwhite',
              dspConnections: {
                spotify: { connected: false, artistName: null },
                appleMusic: { connected: false, artistName: null },
              },
            })
          }
          type='button'
        >
          hydrate
        </button>
      );
    }

    const { rerender } = render(
      <PreviewPanelProvider scope='app-shell'>
        <RailProbe />
        <DataProbe />
      </PreviewPanelProvider>
    );

    fireEvent.click(screen.getByTestId('hydrate'));
    expect(screen.getByTestId('rail-data').textContent).toBe('timwhite');

    rerender(
      <PreviewPanelProvider scope='chat'>
        <RailProbe />
        <DataProbe />
      </PreviewPanelProvider>
    );
    expect(screen.getByTestId('rail-data').textContent).toBe('none');
  });
});
