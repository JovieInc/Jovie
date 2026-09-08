import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SymphonyCodexAccountControl } from '@/components/features/admin/hud/SymphonyCodexAccountControl';

const SNAPSHOT = {
  schema: 'symphony-codex-account-control/v1',
  availability: 'ready',
  binding: {
    boundLabel: 'personal',
    recognized: false,
    selectable: false,
    canSwitch: false,
    canRestart: false,
    reviewOnly: true,
    serviceActive: true,
  },
  accounts: [
    { label: 'meetjovie', state: 'usage-exhausted', reconnectEligible: true },
    { label: 'jovie', state: 'stale', reconnectEligible: true },
    { label: 'timwhite-co', state: 'unknown', reconnectEligible: true },
  ],
  session: null,
};

describe('SymphonyCodexAccountControl', () => {
  it('reserves loading geometry then reconnects an approved account inline', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockReturnValue(new Promise(() => undefined))
    );
    const first = render(<SymphonyCodexAccountControl />);
    expect(
      screen.getByTestId('ovie-codex-account-loading')
    ).toBeInTheDocument();
    expect(screen.getByTestId('ovie-codex-account-control')).toHaveClass(
      'min-h-56'
    );
    first.unmount();
    const pending = {
      id: 'sess',
      account: 'meetjovie',
      phase: 'authorization-pending',
      userCode: 'ABCD-1234',
      verificationUri: 'https://auth.openai.com/codex/device',
      receipt: null,
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => SNAPSHOT })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ...SNAPSHOT, session: pending }),
      });
    vi.stubGlobal('fetch', fetchMock);
    render(<SymphonyCodexAccountControl />);
    const user = userEvent.setup();
    await waitFor(() => {
      expect(
        screen.getByTestId('ovie-codex-account-table')
      ).toBeInTheDocument();
    });
    expect(
      screen.getByTestId('ovie-codex-account-row-meetjovie')
    ).toHaveTextContent('meetjovie');
    expect(
      screen.getByTestId('ovie-codex-account-row-jovie')
    ).toHaveTextContent('Stale');
    expect(
      screen.getByTestId('ovie-codex-account-row-timwhite-co')
    ).toHaveTextContent('Unknown');
    expect(screen.queryByText('personal')).not.toBeInTheDocument();
    const status = screen.getByTestId('ovie-codex-account-status');
    expect(status).toHaveTextContent('unrecognized');
    expect(status).toHaveTextContent('Switch and restart stay unavailable');
    const reconnect = screen.getByTestId(
      'ovie-codex-account-reconnect-meetjovie'
    );
    await user.click(reconnect);
    expect(status).toHaveAttribute('data-phase', 'confirmation');
    expect(
      screen.getByTestId('ovie-codex-account-row-meetjovie')
    ).toHaveAttribute('data-selected', 'true');
    await user.click(screen.getByTestId('ovie-codex-account-confirm'));
    await waitFor(() => {
      expect(status).toHaveAttribute('data-phase', 'authorization-pending');
    });
    expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/admin/hud/symphony-codex-accounts',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ account: 'meetjovie', confirm: true }),
      })
    );
    expect(status).toHaveTextContent('ABCD-1234');
    await waitFor(() => {
      expect(reconnect).toHaveFocus();
    });
    expect(
      within(screen.getByTestId('ovie-codex-account-table')).getAllByRole(
        'button',
        { name: /Reconnect/ }
      )
    ).toHaveLength(3);
  });
});
