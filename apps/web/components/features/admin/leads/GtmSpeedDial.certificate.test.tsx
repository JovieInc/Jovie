import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LeadPipelineSettings } from '@/lib/queries';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { GtmSpeedDial } from './GtmSpeedDial';

const mocks = vi.hoisted(() => ({
  settingsQuery: vi.fn(),
  mutation: vi.fn(),
  invalidateQueries: vi.fn(),
  refresh: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

vi.mock('@/lib/queries', async () => {
  const [fetchQueries, { queryKeys }] = await Promise.all([
    vi.importActual<typeof import('@/lib/queries/fetch')>(
      '@/lib/queries/fetch'
    ),
    vi.importActual<typeof import('@/lib/queries/keys')>('@/lib/queries/keys'),
  ]);
  return {
    isForbiddenError: fetchQueries.isForbiddenError,
    queryKeys,
    useLeadPipelineSettingsQuery: () => mocks.settingsQuery(),
    useUpdateLeadPipelineSettingsMutation: () => mocks.mutation(),
  };
});
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
  useRouter: () => ({ refresh: mocks.refresh }),
}));
vi.mock('@/components/feedback', () => ({ toast: mocks.toast }));

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
  });
}

describe('GtmSpeedDial certificate', () => {
  let mutateAsync: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mutateAsync = vi.fn().mockResolvedValue({});
    mocks.mutation.mockReturnValue({ mutateAsync, isPending: false });
  });

  it('is axe-clean while loading and after a failed read', async () => {
    mocks.settingsQuery.mockReturnValue({
      data: undefined,
      error: null,
      isLoading: true,
      isError: false,
    });
    const loading = render(<GtmSpeedDial />);
    expect(screen.queryByRole('button')).toBeNull();
    await expectNoA11yViolations(loading.container);
    loading.unmount();

    mocks.settingsQuery.mockReturnValue({
      data: undefined,
      error: new Error('boom'),
      isLoading: false,
      isError: true,
    });
    const { container } = render(<GtmSpeedDial />);
    expect(
      screen.getByText('Failed to load pipeline settings.')
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('marks the active preset pressed and reports the pipeline, axe-clean', async () => {
    loaded(settings);
    const { container } = render(<GtmSpeedDial />);

    expect(
      screen.getByRole('button', { name: 'Normal (25/day)' })
    ).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Off' })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
    expect(
      screen.getByText(
        /Pipeline active · 7 invited today · Next run in ~15 min/
      )
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('applies a preset, refreshes and confirms', async () => {
    const user = userEvent.setup();
    loaded(settings);
    render(<GtmSpeedDial />);

    await user.click(screen.getByRole('button', { name: 'Fast (100/day)' }));

    expect(mutateAsync).toHaveBeenCalledExactlyOnceWith({
      ...settings,
      dailySendCap: 100,
      maxPerHour: 25,
      dailyQueryBudget: 300,
    });
    expect(mocks.invalidateQueries).toHaveBeenCalledOnce();
    expect(mocks.refresh).toHaveBeenCalledOnce();
    expect(mocks.toast.success).toHaveBeenCalledWith('Pipeline set to fast');
    expect(
      screen.getByRole('button', { name: 'Fast (100/day)' })
    ).toHaveAttribute('aria-pressed', 'true');
  });

  it('pauses the pipeline through Off', async () => {
    const user = userEvent.setup();
    loaded(settings);
    render(<GtmSpeedDial />);

    await user.click(screen.getByRole('button', { name: 'Off' }));

    expect(mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: false, dailySendCap: 1 })
    );
    expect(mocks.toast.success).toHaveBeenCalledWith('Pipeline paused');
  });

  it('rolls the optimistic choice back and reports a failed update', async () => {
    const user = userEvent.setup();
    mutateAsync.mockRejectedValue(new Error('nope'));
    loaded(settings);
    render(<GtmSpeedDial />);

    await user.click(screen.getByRole('button', { name: 'Test (5/day)' }));

    expect(mocks.toast.error).toHaveBeenCalledWith(
      'Failed to update pipeline speed'
    );
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(
      screen.getByRole('button', { name: 'Normal (25/day)' })
    ).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows a custom configuration and resets it to Normal, axe-clean', async () => {
    const user = userEvent.setup();
    loaded({ ...settings, dailySendCap: 40, maxPerHour: 12 });
    const { container } = render(<GtmSpeedDial />);

    expect(screen.getByText('Custom: 40/day, 12/hr')).toBeInTheDocument();
    for (const name of ['Off', 'Test (5/day)', 'Normal (25/day)']) {
      expect(screen.getByRole('button', { name })).toHaveAttribute(
        'aria-pressed',
        'false'
      );
    }
    await expectNoA11yViolations(container);

    await user.click(screen.getByRole('button', { name: 'Reset To Normal' }));

    expect(mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ dailySendCap: 25, maxPerHour: 10 })
    );
  });

  it('disables every control while an update is pending', () => {
    mocks.mutation.mockReturnValue({ mutateAsync, isPending: true });
    loaded({ ...settings, enabled: false, dailySendCap: 40 });
    render(<GtmSpeedDial />);

    for (const button of screen.getAllByRole('button')) {
      expect(button).toBeDisabled();
    }
    expect(screen.getByText(/Pipeline paused/)).toBeInTheDocument();
  });
});
