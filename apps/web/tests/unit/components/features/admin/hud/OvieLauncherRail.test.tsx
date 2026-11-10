import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { OvieLauncherRail } from '@/components/features/admin/hud/OvieLauncherRail';
import {
  OVIE_LAUNCHER_CATALOG,
  rankLaunchers,
  resolveLauncherDestination,
} from '@/lib/hud/ovie-launchers';

const macApp = vi.hoisted(() => ({ value: false }));
const pushMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/desktop/electron-bridge', () => ({
  launchOperatorControl: vi.fn().mockResolvedValue({ ok: true }),
  useIsElectronRuntime: () => macApp.value,
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: pushMock }) }));

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
    availability: { ...READY, gmail: 'unavailable' },
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

  it('web door never renders launchers it cannot reach and links Fleet in-app', async () => {
    macApp.value = false;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => INVENTORY })
    );
    render(<OvieLauncherRail />);
    await waitFor(() => {
      expect(screen.getByTestId('ovie-launcher-fleet')).toBeEnabled();
    });
    expect(
      screen.queryByTestId('ovie-launcher-gbrain')
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('ovie-launcher-hermes')
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('ovie-launcher-symphony')
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('ovie-launcher-gmail')).toBeDisabled();
    expect(
      screen.queryByTestId('ovie-launcher-hermes-cli-worker')
    ).not.toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByTestId('ovie-launcher-fleet'));
    expect(pushMock).toHaveBeenCalledWith('/app/ov/operations');
    await user.click(screen.getByText('All tools'));
    await user.type(screen.getByTestId('ovie-launcher-search'), 'gbrain');
    expect(screen.getByText('No tools match that search.')).toBeInTheDocument();
  });

  it('Mac app shows local launchers as Local, enabled without server preflight', async () => {
    macApp.value = true;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => INVENTORY })
    );
    render(<OvieLauncherRail />);
    await waitFor(() => {
      expect(screen.getByTestId('ovie-launcher-gbrain')).toBeEnabled();
    });
    expect(screen.getByTestId('ovie-launcher-hermes')).toBeEnabled();
    expect(
      screen.getByTestId('ovie-launcher-group-internal')
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('ovie-launcher-group-external')
    ).toBeInTheDocument();
    macApp.value = false;
  });

  it('names launcher buttons from their visible content (WCAG 2.5.3)', async () => {
    macApp.value = true;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => INVENTORY })
    );
    render(<OvieLauncherRail />);
    await waitFor(() => {
      expect(screen.getByTestId('ovie-launcher-gbrain')).toBeEnabled();
    });

    // The accessible name must contain the visible text: label and status
    // are both visible spans, so the content is the name (same convention
    // as the compact rail). No overriding aria-label on the buttons.
    for (const [id, name] of [
      ['gmail', /gmail\s*unavailable/i],
      ['gbrain', /gbrain\s*local/i],
      ['fleet', /fleet\s*ready/i],
    ] as const) {
      const button = screen.getByTestId(`ovie-launcher-${id}`);
      expect(button).not.toHaveAttribute('aria-label');
      expect(button).toHaveAccessibleName(name);
    }
    macApp.value = false;
  });

  it('compact renders only ready primary destinations and no chrome', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => INVENTORY })
    );
    render(<OvieLauncherRail compact />);

    await waitFor(() => {
      expect(screen.getByTestId('ovie-launcher-fleet')).toBeEnabled();
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
