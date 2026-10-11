import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { OvieLauncherRail } from '@/components/features/admin/hud/OvieLauncherRail';
import {
  OVIE_LAUNCHER_CATALOG,
  rankLaunchers,
  resolveLauncherDestination,
} from '@/lib/hud/ovie-launchers';

vi.mock('@/lib/desktop/electron-bridge', () => ({
  launchOperatorControl: vi.fn().mockResolvedValue({ ok: true }),
}));

const READY = Object.fromEntries(
  OVIE_LAUNCHER_CATALOG.filter(item => !item.agentCliOnly).map(item => [
    item.id,
    'ready' as const,
  ])
);

const INVENTORY = rankLaunchers({
  destinations: Object.fromEntries(
    OVIE_LAUNCHER_CATALOG.map(definition => [
      definition.id,
      resolveLauncherDestination(definition, {}),
    ])
  ),
  state: {
    timActionCount: 0,
    availability: { ...READY, symphony: 'unavailable' },
  },
});

describe('OvieLauncherRail', () => {
  it('explains the admin step-up lock instead of a generic failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue({ ok: false, status: 403, json: async () => ({}) })
    );
    render(<OvieLauncherRail />);
    expect(
      await screen.findByText(
        'Admin data is locked. Unlock with Touch ID, then retry.'
      )
    ).toBeInTheDocument();
  });

  it('keeps the generic failure for real outages', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue({ ok: false, status: 500, json: async () => ({}) })
    );
    render(<OvieLauncherRail />);
    expect(
      await screen.findByText('Launcher destinations could not be loaded.')
    ).toBeInTheDocument();
  });

  it('separates local/SSH from web, disables unavailable, and hides agent CLI', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => INVENTORY })
    );
    render(<OvieLauncherRail />);
    await waitFor(() => {
      expect(screen.getByTestId('ovie-launcher-gbrain')).toBeEnabled();
    });
    expect(
      screen.getByTestId('ovie-launcher-group-internal')
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('ovie-launcher-group-external')
    ).toBeInTheDocument();
    expect(screen.getByTestId('ovie-launcher-symphony')).toBeDisabled();
    expect(
      screen.queryByTestId('ovie-launcher-hermes-cli-worker')
    ).not.toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByText('All tools'));
    await user.type(screen.getByTestId('ovie-launcher-search'), 'symphony');
    expect(screen.getByTestId('ovie-launcher-all-symphony')).toHaveTextContent(
      'ssh gem'
    );
    expect(screen.getByTestId('ovie-launcher-all-symphony')).toHaveTextContent(
      'Preflight did not reach'
    );
    expect(
      screen.queryByTestId('ovie-launcher-all-gmail')
    ).not.toBeInTheDocument();
  });

  it('compact renders only ready primary destinations and no chrome', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => INVENTORY })
    );
    render(<OvieLauncherRail compact />);

    await waitFor(() => {
      expect(screen.getByTestId('ovie-launcher-gbrain')).toBeEnabled();
    });
    expect(screen.queryByText('All tools')).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('ovie-launcher-search')
    ).not.toBeInTheDocument();
  });

  it('compact renders nothing while the inventory is locked or empty', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue({ ok: false, status: 403, json: async () => ({}) })
    );
    const { container } = render(<OvieLauncherRail compact />);

    await waitFor(() => {
      expect(fetch).toHaveBeenCalled();
    });
    expect(container).toBeEmptyDOMElement();
  });
});

describe('OvieLauncherRail loading geometry', () => {
  it('reserves one slot per primary launcher in the loaded group frames', async () => {
    let resolveFetch: (value: unknown) => void = () => undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockReturnValue(
        new Promise(resolve => {
          resolveFetch = resolve;
        })
      )
    );
    render(<OvieLauncherRail />);

    const skeleton = screen.getByTestId('ovie-launcher-skeleton');
    const frames = skeleton.querySelectorAll('fieldset');
    const slotCounts = Array.from(frames).map(
      frame => frame.querySelectorAll('.animate-pulse').length
    );
    const primaryCounts = (['internal', 'external'] as const).map(
      group =>
        INVENTORY.primary.filter(control => control.group === group).length
    );
    // Same frames, same slot count as the fetched primary rail, so the
    // swap does not move the HUD below it.
    expect(slotCounts).toEqual(primaryCounts);

    resolveFetch({ ok: true, status: 200, json: async () => INVENTORY });
    expect(
      await screen.findByTestId('ovie-launcher-group-internal')
    ).toBeInTheDocument();
    expect(screen.queryByTestId('ovie-launcher-skeleton')).toBeNull();
  });
});
