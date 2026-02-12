import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SettingsNotificationsSection } from '@/components/dashboard/organisms/SettingsNotificationsSection';

const updateNotificationsAsyncMock = vi.fn();

vi.mock('@/lib/queries', () => ({
  useNotificationSettingsMutation: () => ({
    updateNotificationsAsync: updateNotificationsAsyncMock,
  }),
}));

describe('SettingsNotificationsSection', () => {
  it('only disables the toggled switch while its request is pending', async () => {
    let resolveMarketingRequest: () => void = () => undefined;

    const marketingRequest = new Promise<void>(resolve => {
      resolveMarketingRequest = resolve;
    });

    updateNotificationsAsyncMock.mockImplementation(({ marketing_emails }) => {
      if (typeof marketing_emails === 'boolean') {
        return marketingRequest;
      }

      return Promise.resolve();
    });

    render(<SettingsNotificationsSection />);

    const switches = screen.getAllByRole('switch');
    const marketingSwitch = switches[0];
    const verificationSwitch = switches[1];

    fireEvent.click(marketingSwitch);

    await waitFor(() => {
      expect(marketingSwitch).toBeDisabled();
    });

    expect(verificationSwitch).not.toBeDisabled();

    fireEvent.click(verificationSwitch);

    await waitFor(() => {
      expect(updateNotificationsAsyncMock).toHaveBeenCalledWith({
        require_double_opt_in: false,
      });
    });

    resolveMarketingRequest();

    await waitFor(() => {
      expect(marketingSwitch).not.toBeDisabled();
    });
  });
});
