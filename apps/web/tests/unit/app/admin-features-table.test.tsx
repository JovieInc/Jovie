import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AdminFeaturesTable,
  getFlagEnvStatus,
} from '@/app/app/(shell)/admin/features/AdminFeaturesTable';

vi.mock('@/components/feedback', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const copyToClipboardMock = vi.fn().mockResolvedValue(true);
vi.mock('@/hooks/useClipboard', () => ({
  copyToClipboard: (...args: unknown[]) => copyToClipboardMock(...args),
  useClipboard: () => ({
    copy: copyToClipboardMock,
    status: 'idle',
    isCopying: false,
    isSuccess: false,
    isError: false,
    reset: vi.fn(),
  }),
}));

const ROWS = [
  {
    flagKey: 'spotify_oauth',
    name: 'Spotify Oauth',
    description: 'Connect Spotify accounts via OAuth.',
    defaultEnabled: false,
    dev: null,
    staging: true,
    prod: null,
  },
  {
    flagKey: 'shell_chat_v1',
    name: 'Shell Chat V1',
    description: 'Enable shell chat surface.',
    defaultEnabled: true,
    dev: false,
    staging: null,
    prod: null,
  },
] as const;

describe('getFlagEnvStatus', () => {
  it('reports Off · Default when no override and default is false', () => {
    expect(getFlagEnvStatus(null, false)).toEqual({
      effective: false,
      overridden: false,
      valueLabel: 'Off',
      sourceLabel: 'Default',
      statusText: 'Off · Default',
    });
  });

  it('reports On · Default when no override and default is true', () => {
    expect(getFlagEnvStatus(null, true)).toEqual({
      effective: true,
      overridden: false,
      valueLabel: 'On',
      sourceLabel: 'Default',
      statusText: 'On · Default',
    });
  });

  it('reports On · Override when override is true', () => {
    expect(getFlagEnvStatus(true, false)).toEqual({
      effective: true,
      overridden: true,
      valueLabel: 'On',
      sourceLabel: 'Override',
      statusText: 'On · Override',
    });
  });

  it('reports Off · Override when override is false against default true', () => {
    expect(getFlagEnvStatus(false, true)).toEqual({
      effective: false,
      overridden: true,
      valueLabel: 'Off',
      sourceLabel: 'Override',
      statusText: 'Off · Override',
    });
  });
});

describe('AdminFeaturesTable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  it('shows raw flag keys and explicit On/Off · Default/Override labels', () => {
    render(<AdminFeaturesTable initialRows={ROWS} currentTier='dev' />);

    expect(screen.getByTestId('admin-features-table')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Copy flag key spotify_oauth' })
    ).toHaveTextContent('spotify_oauth');
    expect(
      screen.getByRole('button', { name: 'Copy flag key shell_chat_v1' })
    ).toHaveTextContent('shell_chat_v1');

    const statuses = screen.getAllByTestId(/flag-env-status-/);
    // 2 flags × 3 envs
    expect(statuses).toHaveLength(6);

    // spotify_oauth: dev default off, staging override on, prod default off
    expect(statuses[0]).toHaveAttribute('data-testid', 'flag-env-status-dev');
    expect(statuses[0]).toHaveAttribute('data-value', 'off');
    expect(statuses[0]).toHaveAttribute('data-source', 'default');
    expect(statuses[0]).toHaveTextContent('Off · Default');

    expect(statuses[1]).toHaveAttribute(
      'data-testid',
      'flag-env-status-staging'
    );
    expect(statuses[1]).toHaveAttribute('data-value', 'on');
    expect(statuses[1]).toHaveAttribute('data-source', 'override');
    expect(statuses[1]).toHaveTextContent('On · Override');

    expect(statuses[2]).toHaveAttribute('data-testid', 'flag-env-status-prod');
    expect(statuses[2]).toHaveAttribute('data-value', 'off');
    expect(statuses[2]).toHaveAttribute('data-source', 'default');
  });

  it('shows reset only for overrides and keeps it hidden for defaults', () => {
    render(<AdminFeaturesTable initialRows={ROWS} currentTier='dev' />);

    const stagingReset = screen.getByRole('button', {
      name: 'Reset Staging to default',
    });
    expect(stagingReset).not.toBeDisabled();
    expect(stagingReset).toHaveAttribute('data-overridden', 'true');
    expect(stagingReset.className).not.toMatch(/opacity-0/);

    // Default cells keep a reserved, non-interactive reset slot (no layout shift).
    const defaultSlots = screen.getAllByTestId('flag-reset-slot');
    expect(defaultSlots.length).toBeGreaterThan(0);
    for (const btn of defaultSlots) {
      expect(btn).toBeDisabled();
      expect(btn).toHaveAttribute('data-overridden', 'false');
      expect(btn).toHaveAttribute('aria-hidden', 'true');
      expect(btn.className).toMatch(/opacity-0/);
    }
  });

  it('copies the raw flag key when the key control is activated', async () => {
    const user = userEvent.setup();
    const { toast } = await import('@/components/feedback');

    render(<AdminFeaturesTable initialRows={ROWS} currentTier='dev' />);

    await user.click(
      screen.getByRole('button', { name: 'Copy flag key spotify_oauth' })
    );

    expect(copyToClipboardMock).toHaveBeenCalledWith('spotify_oauth');
    expect(toast.success).toHaveBeenCalledWith('Copied spotify_oauth');
  });

  it('labels switches with value and source for assistive tech', () => {
    render(<AdminFeaturesTable initialRows={ROWS} currentTier='dev' />);

    // Current tier switch includes "(current)" and status words.
    expect(
      screen.getByRole('switch', {
        name: /Dev \(current\): Off, Default\. Toggle value\./i,
      })
    ).toBeInTheDocument();

    // Staging override for spotify_oauth.
    expect(
      screen.getByRole('switch', {
        name: /Staging: On, Override\. Toggle value\./i,
      })
    ).toBeInTheDocument();
  });

  it('keeps flag name and description visible alongside the raw key', () => {
    render(<AdminFeaturesTable initialRows={ROWS} currentTier='prod' />);

    const table = screen.getByTestId('admin-features-table');
    expect(within(table).getByText('Spotify Oauth')).toBeInTheDocument();
    expect(
      within(table).getByText('Connect Spotify accounts via OAuth.')
    ).toBeInTheDocument();
  });
});
