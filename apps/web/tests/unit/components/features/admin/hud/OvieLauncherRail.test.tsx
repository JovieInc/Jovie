import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OvieLauncherRail } from '@/components/features/admin/hud/OvieLauncherRail';
import {
  OVIE_LAUNCHER_CATALOG,
  rankLaunchers,
  resolveLauncherDestination,
} from '@/lib/hud/ovie-launchers';

const bridge = vi.hoisted(() => ({
  isElectron: true,
  launchOperatorControl: vi.fn().mockResolvedValue({ ok: true }),
  openGemTerminal: vi.fn().mockResolvedValue({ ok: true }),
}));

const feedback = vi.hoisted(() => ({ error: vi.fn() }));

vi.mock('@/lib/desktop/electron-bridge', () => ({
  launchOperatorControl: bridge.launchOperatorControl,
  openGemTerminal: bridge.openGemTerminal,
  useIsElectronRuntime: () => bridge.isElectron,
}));

vi.mock('@/components/feedback', () => ({ toast: feedback }));

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

const READY_INVENTORY = rankLaunchers({
  destinations: Object.fromEntries(
    OVIE_LAUNCHER_CATALOG.map(definition => [
      definition.id,
      resolveLauncherDestination(definition, {}),
    ])
  ),
  state: {
    timActionCount: 0,
    availability: READY,
  },
});

describe('OvieLauncherRail', () => {
  beforeEach(() => {
    bridge.isElectron = true;
    bridge.launchOperatorControl.mockReset().mockResolvedValue({ ok: true });
    bridge.openGemTerminal.mockReset().mockResolvedValue({ ok: true });
    feedback.error.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
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
      'Open Gem Terminal'
    );
    expect(screen.getByTestId('ovie-launcher-all-symphony')).toHaveTextContent(
      'Preflight did not reach'
    );
    expect(
      screen.queryByTestId('ovie-launcher-all-gmail')
    ).not.toBeInTheDocument();
  });

  it('renders and invokes the fixed Gem terminal action without arguments', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => READY_INVENTORY })
    );
    let finishLaunch: (result: { ok: boolean }) => void = () => undefined;
    bridge.openGemTerminal.mockReturnValue(
      new Promise(resolve => {
        finishLaunch = resolve;
      })
    );
    const user = userEvent.setup();
    render(<OvieLauncherRail />);

    const terminalAction = await screen.findByRole('button', {
      name: 'Open Gem Terminal, Ready',
    });
    await user.click(terminalAction);

    expect(
      screen.getByRole('button', { name: 'Open Gem Terminal, Opening…' })
    ).toBeDisabled();
    finishLaunch({ ok: true });
    await waitFor(() => {
      expect(terminalAction).toHaveAttribute('data-launch-state', 'opened');
    });
    expect(bridge.openGemTerminal).toHaveBeenCalledTimes(1);
    expect(bridge.openGemTerminal).toHaveBeenCalledWith();
    expect(bridge.launchOperatorControl).not.toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'ssh' })
    );

    await user.click(screen.getByTestId('ovie-launcher-github-prs'));
    expect(bridge.launchOperatorControl).toHaveBeenCalledWith({
      id: 'github-prs',
      kind: 'web',
      href: 'https://github.com/JovieInc/Jovie/pulls',
    });
  });

  it('shows unavailable outside Ovie and a recoverable error after launch failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => READY_INVENTORY })
    );
    bridge.isElectron = false;
    const { rerender } = render(<OvieLauncherRail />);

    const unavailable = await screen.findByRole('button', {
      name: 'Open Gem Terminal, Unavailable',
    });
    expect(unavailable).toBeDisabled();

    bridge.isElectron = true;
    bridge.openGemTerminal.mockResolvedValue({
      ok: false,
      reason: 'open-terminal-failed',
    });
    rerender(<OvieLauncherRail />);
    const user = userEvent.setup();
    const terminalAction = await screen.findByRole('button', {
      name: 'Open Gem Terminal, Ready',
    });
    await user.click(terminalAction);

    await waitFor(() => {
      expect(terminalAction).toHaveAttribute('data-launch-state', 'error');
    });
    expect(terminalAction).toBeEnabled();
    expect(feedback.error).toHaveBeenCalledWith(
      "Ovie couldn't open Terminal. Check that Terminal is available and try again."
    );

    bridge.openGemTerminal.mockRejectedValue(new Error('bridge closed'));
    await user.click(terminalAction);
    await waitFor(() => {
      expect(feedback.error).toHaveBeenCalledTimes(2);
    });
  });
});
