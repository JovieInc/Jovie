import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EarlyAccessSettingsSection } from './EarlyAccessSettingsSection';

describe('EarlyAccessSettingsSection', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('loads the saved cohort state and enables the toggle', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ enabled: true }), { status: 200 })
      );

    render(<EarlyAccessSettingsSection />);

    const toggle = await screen.findByRole('switch', {
      name: 'Join the early-access cohort',
    });
    await waitFor(() => expect(toggle).toBeChecked());
    expect(toggle).toBeEnabled();
    expect(fetchMock).toHaveBeenCalledWith('/api/account/early-access', {
      cache: 'no-store',
    });
  });

  it('keeps the toggle disabled when loading fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));

    render(<EarlyAccessSettingsSection />);

    await waitFor(() =>
      expect(
        screen.getByRole('switch', {
          name: 'Join the early-access cohort',
        })
      ).toBeDisabled()
    );
  });
});
