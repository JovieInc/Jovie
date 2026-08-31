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
});
