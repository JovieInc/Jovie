import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { OvieLauncherRail } from '@/components/features/admin/hud/OvieLauncherRail';
import type {
  OvieLauncherControl,
  OvieLauncherInventory,
} from '@/lib/hud/ovie-launchers';

vi.mock('@/lib/desktop/electron-bridge', () => ({
  launchOperatorControl: vi.fn().mockResolvedValue({ ok: true }),
}));

function control(
  overrides: Partial<OvieLauncherControl> &
    Pick<OvieLauncherControl, 'id' | 'label' | 'group'>
): OvieLauncherControl {
  return {
    kind: 'web',
    owner: 'human',
    loop: 'observe',
    requiredOnPrimary: true,
    agentCliOnly: false,
    status: 'ready',
    rankScore: 100,
    why: 'Destination preflight succeeded.',
    destinationSummary: overrides.label,
    destinationDisplay: overrides.id,
    searchText: overrides.id,
    ...overrides,
  };
}

const INVENTORY: OvieLauncherInventory = {
  generatedAtIso: '2026-08-31T00:00:00.000Z',
  primary: [
    control({
      id: 'gbrain',
      label: 'GBrain',
      group: 'internal',
      destinationDisplay: 'http://127.0.0.1:7801',
      href: 'http://127.0.0.1:7801',
      searchText: 'gbrain memory wiki',
    }),
    control({
      id: 'symphony',
      label: 'Symphony',
      group: 'internal',
      kind: 'ssh',
      loop: 'recover',
      status: 'unavailable',
      why: 'Preflight did not reach the destination.',
      destinationDisplay: 'ssh gem',
      sshHost: 'gem',
      searchText: 'symphony gem tui',
    }),
    control({
      id: 'gmail',
      label: 'Gmail',
      group: 'external',
      loop: 'communicate',
      destinationDisplay: 'https://mail.google.com',
      href: 'https://mail.google.com',
      searchText: 'gmail mail email',
    }),
  ],
  advanced: [
    control({
      id: 'hermes-cli-worker',
      label: 'Hermes CLI worker',
      group: 'internal',
      kind: 'ssh',
      owner: 'agent',
      agentCliOnly: true,
      requiredOnPrimary: false,
      status: 'not_configured',
      rankScore: -1000,
      why: 'Agent-owned CLI.',
      destinationDisplay: 'CLI only',
      searchText: 'hermes cli worker agent',
    }),
  ],
  all: [],
};
INVENTORY.all.push(...INVENTORY.primary, ...INVENTORY.advanced);

describe('OvieLauncherRail', () => {
  it('separates local/SSH from web, disables unavailable controls, and keeps agent CLI off the rail', async () => {
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
