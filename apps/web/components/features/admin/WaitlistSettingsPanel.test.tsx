import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WaitlistSettingsResponse } from '@/lib/queries';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { WaitlistSettingsPanel } from './WaitlistSettingsPanel';

const { mockMutate, queryState, mutationState } = vi.hoisted(() => ({
  mockMutate: vi.fn(),
  queryState: {
    current: {
      data: undefined as WaitlistSettingsResponse | undefined,
      isLoading: false,
      isError: false,
      error: null as unknown,
    },
  },
  mutationState: { isPending: false },
}));

vi.mock('@/lib/auth/client', () => ({
  authClient: {
    passkey: { listUserPasskeys: vi.fn(), addPasskey: vi.fn() },
    signIn: { passkey: vi.fn() },
  },
}));

vi.mock('@/lib/queries', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/queries')>();
  return {
    ...actual,
    useWaitlistSettingsQuery: () => queryState.current,
    useWaitlistSettingsMutation: () => ({
      mutate: mockMutate,
      isPending: mutationState.isPending,
    }),
  };
});

const SETTINGS: WaitlistSettingsResponse = {
  gateEnabled: true,
  autoAcceptEnabled: false,
  autoAcceptAfterDays: 7,
  autoAcceptDailyLimit: 25,
  autoAcceptedToday: 3,
  autoAcceptResetsAt: '2026-09-02T00:00:00.000Z',
};

function loaded(settings: WaitlistSettingsResponse = SETTINGS) {
  queryState.current = {
    data: settings,
    isLoading: false,
    isError: false,
    error: null,
  };
}

describe('WaitlistSettingsPanel certificate', () => {
  beforeEach(() => {
    mockMutate.mockReset();
    mutationState.isPending = false;
    loaded();
  });

  it('shows the loading row while settings load', async () => {
    queryState.current = {
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
    };
    const { container } = render(<WaitlistSettingsPanel />);
    expect(
      screen.getByText('Loading waitlist settings...')
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('shows the load error message', async () => {
    queryState.current = {
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('Settings store unavailable'),
    };
    const { container } = render(<WaitlistSettingsPanel />);
    expect(screen.getByText('Settings store unavailable')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('keeps typed limits and focus through a parent rerender and blur', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<WaitlistSettingsPanel />);

    const days = screen.getByRole('spinbutton', {
      name: 'Auto-accept After Days',
    });
    await user.type(days, '0');
    expect(days).toHaveValue(70);

    rerender(<WaitlistSettingsPanel />);
    const daysAfter = screen.getByRole('spinbutton', {
      name: 'Auto-accept After Days',
    });
    expect(daysAfter).toHaveValue(70);
    expect(daysAfter).toHaveFocus();

    const limit = screen.getByRole('spinbutton', {
      name: 'Daily Auto-accept Limit',
    });
    await user.type(limit, '0');
    await user.keyboard('{Escape}');
    limit.blur();
    expect(limit).toHaveValue(250);
    expect(daysAfter).toHaveValue(70);
  });

  it('saves the toggles and clamped limits', async () => {
    const user = userEvent.setup();
    const { container } = render(<WaitlistSettingsPanel />);

    await user.click(screen.getByRole('switch', { name: 'Auto-accept' }));
    await user.type(
      screen.getByRole('spinbutton', { name: 'Daily Auto-accept Limit' }),
      '00000'
    );
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(mockMutate).toHaveBeenCalledWith({
      gateEnabled: true,
      autoAcceptEnabled: true,
      autoAcceptAfterDays: 7,
      autoAcceptDailyLimit: 10_000,
    });
    await expectNoA11yViolations(container);
  });

  it('disables every control while saving', async () => {
    mutationState.isPending = true;
    const { container } = render(<WaitlistSettingsPanel />);

    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(
      screen.getByRole('spinbutton', { name: 'Auto-accept After Days' })
    ).toBeDisabled();
    expect(
      screen.getByRole('switch', { name: 'Manual approval gate' })
    ).toBeDisabled();
    await expectNoA11yViolations(container);
  });
});
