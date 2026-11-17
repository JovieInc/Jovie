import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LeadPipelineSettings } from '@/lib/queries';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { GrowthStatusPanel } from './GrowthStatusPanel';

const mocks = vi.hoisted(() => ({
  settingsQuery: vi.fn(),
  mutation: vi.fn(),
  invalidateQueries: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

vi.mock('@/lib/queries', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/queries')>()),
  useLeadPipelineSettingsQuery: () => mocks.settingsQuery(),
  useUpdateLeadPipelineSettingsMutation: () => mocks.mutation(),
}));
vi.mock('@tanstack/react-query', async importOriginal => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
}));
vi.mock('@/lib/auth/client', () => ({
  authClient: {
    passkey: { listUserPasskeys: vi.fn(), addPasskey: vi.fn() },
    signIn: { passkey: vi.fn() },
  },
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock('@/components/feedback', () => ({ toast: mocks.toast }));
// The speed dial has its own certificate; here it is a fixed marker.
vi.mock('./GtmSpeedDial', () => ({
  detectSpeed: (settings: LeadPipelineSettings) =>
    settings.dailySendCap === 25 ? 'normal' : 'custom',
  GtmSpeedDial: () => <p>Speed dial</p>,
}));

const settings = {
  enabled: true,
  discoveryEnabled: true,
  autoIngestEnabled: true,
  autoIngestMinFitScore: 60,
  autoIngestDailyLimit: 25,
  dailyQueryBudget: 100,
  dailySendCap: 25,
  maxPerHour: 10,
  rampMode: 'manual',
  guardrailsEnabled: true,
  queriesUsedToday: 42,
  autoIngestedToday: 7,
} as LeadPipelineSettings;

function loaded(value: LeadPipelineSettings) {
  mocks.settingsQuery.mockReturnValue({
    data: { settings: value },
    error: null,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  });
}

describe('GrowthStatusPanel certificate', () => {
  let mutateAsync: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mutateAsync = vi.fn().mockResolvedValue({});
    mocks.mutation.mockReturnValue({ mutateAsync, isPending: false });
  });

  it('is axe-clean while the status loads', async () => {
    mocks.settingsQuery.mockReturnValue({
      data: undefined,
      error: null,
      isLoading: true,
      isError: false,
      refetch: vi.fn(),
    });
    const { container } = render(<GrowthStatusPanel />);

    expect(screen.getByText('Loading Growth status...')).toBeInTheDocument();
    expect(screen.queryByRole('switch')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('renders the four metric cards for loaded settings, axe-clean', async () => {
    loaded(settings);
    const { container } = render(<GrowthStatusPanel />);

    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Mode: normal')).toBeInTheDocument();
    expect(screen.getByText('42/100')).toBeInTheDocument();
    expect(screen.getByText('Limit 25 per day')).toBeInTheDocument();
    expect(screen.getByText('10/hour max')).toBeInTheDocument();
    expect(
      screen.getByRole('switch', { name: 'Toggle Growth Automation' })
    ).toBeChecked();
    expect(screen.getByText('On')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('pauses automation from the switch and confirms', async () => {
    const user = userEvent.setup();
    loaded(settings);
    render(<GrowthStatusPanel />);

    await user.click(
      screen.getByRole('switch', { name: 'Toggle Growth Automation' })
    );

    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledExactlyOnceWith({
        ...settings,
        enabled: false,
      })
    );
    await waitFor(() =>
      expect(mocks.toast.success).toHaveBeenCalledWith(
        'Growth automation paused'
      )
    );
    expect(mocks.invalidateQueries).toHaveBeenCalledOnce();
  });

  it('enables a paused, custom pipeline and reports a failed update', async () => {
    const user = userEvent.setup();
    loaded({ ...settings, enabled: false, dailySendCap: 40 });
    const { container } = render(<GrowthStatusPanel />);
    expect(screen.getByText('Paused')).toBeInTheDocument();
    expect(screen.getByText('Mode: Custom')).toBeInTheDocument();
    expect(screen.getByText('Off')).toBeInTheDocument();
    await expectNoA11yViolations(container);

    await user.click(screen.getByRole('switch'));
    await waitFor(() =>
      expect(mocks.toast.success).toHaveBeenCalledWith(
        'Growth automation enabled'
      )
    );
    expect(mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: true })
    );

    mutateAsync.mockRejectedValue(new Error('nope'));
    await user.click(screen.getByRole('switch'));
    await waitFor(() =>
      expect(mocks.toast.error).toHaveBeenCalledWith(
        'Failed to update Growth automation'
      )
    );
  });

  it('disables the switch while an update is pending', () => {
    mocks.mutation.mockReturnValue({ mutateAsync, isPending: true });
    loaded(settings);
    render(<GrowthStatusPanel />);

    expect(screen.getByRole('switch')).toBeDisabled();
  });

  it('retries a failed read from the error line, axe-clean', async () => {
    const user = userEvent.setup();
    const refetch = vi.fn().mockResolvedValue({});
    mocks.settingsQuery.mockReturnValue({
      data: undefined,
      error: new Error('boom'),
      isLoading: false,
      isError: true,
      refetch,
    });
    const { container } = render(<GrowthStatusPanel />);

    const line = screen.getByText(/Unable to load Growth status\./);
    await user.click(within(line).getByRole('button', { name: 'Retry' }));

    expect(refetch).toHaveBeenCalledOnce();
    await expectNoA11yViolations(container);
  });
});
