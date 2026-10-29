import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { SettingsRiderSection } from './SettingsRiderSection';

vi.mock('@/components/feedback', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
afterEach(() => vi.unstubAllGlobals());
it('saves removal of password protection from the labelled checkbox', async () => {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      rider: {
        technical: [],
        hospitality: [],
        visibility: 'private',
        hasPassword: true,
      },
      version: 1,
      shareUrl: null,
    }),
  });
  vi.stubGlobal('fetch', fetchMock);
  render(<SettingsRiderSection profileId='profile' username='artist' />);
  const checkbox = await screen.findByRole('checkbox', {
    name: 'Remove password protection',
  });
  fireEvent.click(checkbox);
  expect(checkbox).toBeChecked();
  fireEvent.click(screen.getByRole('button', { name: 'Save Rider' }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  const saved = JSON.parse(fetchMock.mock.calls[1][1].body);
  expect(saved.rider.password).toBeNull();
});
