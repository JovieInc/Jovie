import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WaitlistSettingsPanel } from '@/components/admin/WaitlistSettingsPanel';

const toastError = vi.fn();

vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => toastError(...args),
    success: vi.fn(),
  },
}));

describe('WaitlistSettingsPanel', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    toastError.mockReset();
  });

  it('renders settings controls after successful load', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        settings: {
          gateEnabled: true,
          autoAcceptEnabled: false,
          autoAcceptDailyLimit: 25,
          autoAcceptedToday: 3,
        },
      }),
    } as Response);

    render(<WaitlistSettingsPanel />);

    expect(screen.getByText('Loading settings…')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Waitlist gate controls')).toBeInTheDocument();
    });

    expect(screen.getByText('Today: 3')).toBeInTheDocument();
  });

  it('shows an error state when loading settings fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      json: async () => ({}),
    } as Response);

    render(<WaitlistSettingsPanel />);

    await waitFor(() => {
      expect(
        screen.getByText(
          'Unable to load waitlist settings. Please refresh and try again.'
        )
      ).toBeInTheDocument();
    });

    expect(toastError).toHaveBeenCalledWith('Unable to load waitlist settings');
  });
});
