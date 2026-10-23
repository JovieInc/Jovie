import { TooltipProvider } from '@jovie/ui';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  PreviewPanelProvider,
  usePreviewPanelData,
  usePreviewPanelState,
} from '@/app/app/(shell)/dashboard/PreviewPanelContext';
import { ProfilePreviewOpener } from '@/app/app/(shell)/dashboard/profile/ProfilePreviewOpener';
import { RailToggleButton } from '@/components/atoms/RailToggleButton';
import { RightDrawer } from '@/components/molecules/drawer/RightDrawer';
import { TableMetaProvider } from '@/contexts/TableMetaContext';
import { RightRailKeyboardHandler } from '@/hooks/RightRailKeyboardHandler';
import { detectReversibleControl } from '@/tests/utils/reversible-control-detector';

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

function ReversibleRightRailProbe() {
  const { isOpen, toggle } = usePreviewPanelState();
  return (
    <>
      <RailToggleButton
        side='right'
        open={isOpen}
        openLabel='Hide details rail'
        closedLabel='Show details rail'
        onToggle={toggle}
        dataTestId='reversible-right-rail-toggle'
      />
      <RightDrawer isOpen={isOpen} width={360} ariaLabel='Details rail'>
        <button type='button'>Rail action</button>
      </RightDrawer>
      <RightRailKeyboardHandler />
    </>
  );
}

describe('PreviewPanelProvider scope reset (JOV-7150)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('starts closed', () => {
    renderShell('chat');
    expect(screen.getByTestId('rail-open').textContent).toBe('false');
  });

  it('opens the chat rail for the profile panel deep link', () => {
    window.history.pushState({}, '', '/app/chat?panel=profile');
    const { rerender } = renderShell('app-shell');

    rerender(
      <PreviewPanelProvider scope='chat'>
        <RailProbe />
      </PreviewPanelProvider>
    );
    expect(screen.getByTestId('rail-open').textContent).toBe('true');
    window.history.pushState({}, '', '/');
  });

  it('reopens a default-open profile surface after a scope round trip', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('1024'),
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));

    const { rerender } = render(
      <PreviewPanelProvider defaultOpen scope='artist-profile-settings'>
        <RailProbe />
      </PreviewPanelProvider>
    );
    await waitFor(() => {
      expect(screen.getByTestId('rail-open').textContent).toBe('true');
    });

    rerender(
      <PreviewPanelProvider scope='app-shell'>
        <RailProbe />
      </PreviewPanelProvider>
    );
    await waitFor(() => {
      expect(screen.getByTestId('rail-open').textContent).toBe('false');
    });

    rerender(
      <PreviewPanelProvider defaultOpen scope='artist-profile-settings'>
        <RailProbe />
      </PreviewPanelProvider>
    );
    await waitFor(() => {
      expect(screen.getByTestId('rail-open').textContent).toBe('true');
    });
  });

  it('keeps the profile rail open when the page opener remounts on the way back', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('1024'),
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));

    const roundTrip = (scope: string, defaultOpen = false) => (
      <PreviewPanelProvider defaultOpen={defaultOpen} scope={scope}>
        <RailProbe />
        {scope === 'artist-profile-settings' ? <ProfilePreviewOpener /> : null}
      </PreviewPanelProvider>
    );

    const { rerender } = render(roundTrip('artist-profile-settings', true));
    await waitFor(() => {
      expect(screen.getByTestId('rail-open').textContent).toBe('true');
    });

    rerender(roundTrip('app-shell'));
    await waitFor(() => {
      expect(screen.getByTestId('rail-open').textContent).toBe('false');
    });

    rerender(roundTrip('artist-profile-settings', true));
    await waitFor(() => {
      expect(screen.getByTestId('rail-open').textContent).toBe('true');
    });
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

  it('keeps the reopened default-open rail hydrated after a scope round trip', async () => {
    function MountOnlyHydrator() {
      const { setPreviewData } = usePreviewPanelData();
      useEffect(() => {
        setPreviewData(current =>
          current
            ? current
            : {
                username: 'alex',
                displayName: 'Alex',
                avatarUrl: null,
                bio: null,
                genres: null,
                location: null,
                hometown: null,
                activeSinceYear: null,
                links: [],
                profilePath: '/alex',
                dspConnections: {
                  spotify: { connected: false, artistName: null },
                  appleMusic: { connected: false, artistName: null },
                },
              }
        );
        // Mount-only on purpose: the real page hydrator re-runs on its own
        // dependencies and never re-runs after a provider-side wipe.
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);
      return null;
    }

    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('1024'),
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));

    const { rerender } = render(
      <PreviewPanelProvider scope='app-shell'>
        <MountOnlyHydrator />
        <RailProbe />
      </PreviewPanelProvider>
    );
    await waitFor(() => {
      expect(screen.getByTestId('rail-data').textContent).toBe('alex');
    });

    rerender(
      <PreviewPanelProvider defaultOpen scope='artist-profile-settings'>
        <MountOnlyHydrator />
        <RailProbe />
      </PreviewPanelProvider>
    );
    await waitFor(() => {
      expect(screen.getByTestId('rail-open').textContent).toBe('true');
    });
    // The scope reset reopens the rail; the wipe must not swallow the data
    // the page hydrator already mounted, or the rail sticks on its empty
    // skeleton (Account → Back round trip).
    expect(screen.getByTestId('rail-data').textContent).toBe('alex');
  });

  it('certifies repeated cycles on the composed right rail and drawer', async () => {
    const user = userEvent.setup();
    render(
      <TooltipProvider>
        <TableMetaProvider>
          <PreviewPanelProvider scope='app-shell'>
            <ReversibleRightRailProbe />
          </PreviewPanelProvider>
        </TableMetaProvider>
      </TooltipProvider>
    );

    const currentToggle = () =>
      screen.getByTestId('reversible-right-rail-toggle');
    currentToggle().focus();
    // Keyboard focus opens the tooltip above the transient preview. Each
    // Escape belongs to one layer: tooltip first, then the preview.
    await user.keyboard('{Escape}{Escape}');

    await detectReversibleControl({
      name: 'composed preview right rail',
      states: ['closed', 'open'],
      observe: () => ({
        state:
          currentToggle().getAttribute('aria-expanded') === 'true'
            ? 'open'
            : 'closed',
      }),
      activate: async via => {
        currentToggle().focus();
        if (via === 'pointer') {
          await user.click(currentToggle());
        } else {
          fireEvent.keyDown(window, { key: ']' });
        }
      },
      assertContinuity: observation => {
        const expanded = String(observation.state === 'open');
        expect(currentToggle()).toHaveAttribute('aria-expanded', expanded);
        expect(currentToggle()).toHaveAttribute('aria-pressed', expanded);
        expect(currentToggle()).toHaveAccessibleName(
          observation.state === 'open'
            ? 'Hide details rail'
            : 'Show details rail'
        );
        expect(currentToggle()).toHaveFocus();
        expect(screen.getByLabelText('Details rail')).toHaveAttribute(
          'aria-hidden',
          String(observation.state === 'closed')
        );
      },
    });
  });

  /**
   * Controllable lg gate: the provider's desktop presentation is driven by
   * a live (min-width: 1024px) media query. These tests resize across the
   * boundary the way the browser does — via change events — because the
   * chat composer spec proves the crossing on a live viewport.
   */
  function installLargeScreenGate(initialLarge: boolean) {
    const listeners = new Set<(event: { matches: boolean }) => void>();
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('1024') ? initialLarge : false,
      media: query,
      addEventListener: (_type: string, listener: never) => {
        listeners.add(listener as (event: { matches: boolean }) => void);
      },
      removeEventListener: (_type: string, listener: never) => {
        listeners.delete(listener as (event: { matches: boolean }) => void);
      },
    }));
    return {
      crossInto(large: boolean) {
        for (const listener of listeners) {
          listener({ matches: large });
        }
      },
    };
  }

  it('keeps an explicitly opened rail open when the viewport crosses below lg', () => {
    const gate = installLargeScreenGate(true);
    render(
      <PreviewPanelProvider scope='chat'>
        <RailProbe />
      </PreviewPanelProvider>
    );
    // The ?panel=profile deep link, rail toggle and `]` shortcut all open
    // through the same explicit path.
    fireEvent.click(screen.getByTestId('open-rail'));
    expect(screen.getByTestId('rail-open').textContent).toBe('true');

    // Below lg the drawer re-presents the SAME open rail as a modal sheet
    // (RightDrawer's mobile branch sets aria-modal) — the crossing must not
    // silently discard the user's open rail.
    act(() => gate.crossInto(false));
    expect(screen.getByTestId('rail-open').textContent).toBe('true');

    // Dismissing the sheet is still the same explicit close contract.
    fireEvent.click(screen.getByTestId('open-rail'));
    expect(screen.getByTestId('rail-open').textContent).toBe('false');
  });

  it('closes a default-open rail when the viewport crosses below lg', async () => {
    const gate = installLargeScreenGate(true);
    render(
      <PreviewPanelProvider defaultOpen scope='app-shell'>
        <RailProbe />
      </PreviewPanelProvider>
    );
    await waitFor(() => {
      expect(screen.getByTestId('rail-open').textContent).toBe('true');
    });

    // An unsolicited default-open rail must not become an unsolicited modal
    // when the viewport crosses below lg (JOV-7150 closed-by-default).
    act(() => gate.crossInto(false));
    expect(screen.getByTestId('rail-open').textContent).toBe('false');
  });

  it('keeps a user-reopened default-open rail open across the lg crossing', async () => {
    const gate = installLargeScreenGate(true);
    render(
      <PreviewPanelProvider defaultOpen scope='app-shell'>
        <RailProbe />
      </PreviewPanelProvider>
    );
    await waitFor(() => {
      expect(screen.getByTestId('rail-open').textContent).toBe('true');
    });
    // The user's own reopen of a surface rail is an explicit open.
    fireEvent.click(screen.getByTestId('open-rail'));

    act(() => gate.crossInto(false));
    expect(screen.getByTestId('rail-open').textContent).toBe('true');
  });
});
