import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { TourDatesEmptyState } from './TourDatesEmptyState';

const mocks = vi.hoisted(() => ({
  saveKey: vi.fn(),
  connect: vi.fn(),
  savePending: { value: false },
  connectPending: { value: false },
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/lib/queries', () => ({
  useSaveBandsintownApiKeyMutation: () => ({
    mutateAsync: mocks.saveKey,
    isPending: mocks.savePending.value,
  }),
  useConnectBandsintownMutation: () => ({
    mutateAsync: mocks.connect,
    isPending: mocks.connectPending.value,
  }),
}));

vi.mock('@/components/feedback', () => ({ toast: mocks.toast }));

describe('TourDatesEmptyState', () => {
  afterEach(() => {
    vi.clearAllMocks();
    mocks.savePending.value = false;
    mocks.connectPending.value = false;
  });

  it('saves a trimmed API key and reports success', async () => {
    const user = userEvent.setup();
    const onApiKeySaved = vi.fn();
    mocks.saveKey.mockResolvedValue({ success: true, message: 'Key saved' });
    const { container } = render(
      <TourDatesEmptyState
        profileId='profile-1'
        hasApiKey={false}
        onApiKeySaved={onApiKeySaved}
      />
    );

    const save = screen.getByRole('button', { name: 'Save API Key' });
    expect(save).toBeDisabled();
    await expectNoA11yViolations(container);

    const input = screen.getByPlaceholderText('Your Bandsintown API key');
    await user.type(input, '  bit_key  ');
    await user.click(save);

    expect(mocks.saveKey).toHaveBeenCalledWith({ apiKey: 'bit_key' });
    await waitFor(() => expect(onApiKeySaved).toHaveBeenCalledTimes(1));
    expect(mocks.toast.success).toHaveBeenCalledWith('Key saved');
    expect(input).toHaveValue('');
  });

  it('keeps typed text and focus across a parent rerender', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <TourDatesEmptyState profileId='profile-1' hasApiKey />
    );

    const input = screen.getByPlaceholderText(
      'Your artist name on Bandsintown'
    );
    await user.type(input, 'Sasha Waves');
    expect(input).toHaveValue('Sasha Waves');

    rerender(
      <TourDatesEmptyState
        profileId='profile-1'
        hasApiKey
        onConnected={vi.fn()}
      />
    );
    const after = screen.getByPlaceholderText(
      'Your artist name on Bandsintown'
    );
    expect(after).toHaveValue('Sasha Waves');
    expect(after).toHaveFocus();
  });

  it('connects an artist from the keyboard and hands back tour dates', async () => {
    const user = userEvent.setup();
    const onConnected = vi.fn();
    const tourDates = [{ id: 'show-1' }];
    mocks.connect.mockResolvedValue({
      success: true,
      message: 'Connected',
      tourDates,
    });
    const { container } = render(
      <TourDatesEmptyState
        profileId='profile-1'
        hasApiKey
        onConnected={onConnected}
      />
    );

    await user.type(
      screen.getByPlaceholderText('Your artist name on Bandsintown'),
      ' Sasha Waves {Enter}'
    );

    expect(mocks.connect).toHaveBeenCalledWith({ artistName: 'Sasha Waves' });
    await waitFor(() => expect(onConnected).toHaveBeenCalledWith(tourDates));
    await expectNoA11yViolations(container);
  });

  it('reports rejected and failed requests', async () => {
    const user = userEvent.setup();
    mocks.saveKey
      .mockResolvedValueOnce({ success: false, message: 'Invalid key' })
      .mockRejectedValueOnce(new Error('offline'));
    render(<TourDatesEmptyState profileId='profile-1' hasApiKey={false} />);

    const input = screen.getByPlaceholderText('Your Bandsintown API key');
    await user.type(input, 'bad');
    await user.click(screen.getByRole('button', { name: 'Save API Key' }));
    await waitFor(() =>
      expect(mocks.toast.error).toHaveBeenCalledWith('Invalid key')
    );
    expect(input).toHaveValue('bad');

    await user.click(screen.getByRole('button', { name: 'Save API Key' }));
    await waitFor(() =>
      expect(mocks.toast.error).toHaveBeenCalledWith('Failed to save API key')
    );
  });

  it('asks for a name when Enter is pressed on an empty field', async () => {
    const user = userEvent.setup();
    render(<TourDatesEmptyState profileId='profile-1' hasApiKey />);

    await user.type(
      screen.getByPlaceholderText('Your artist name on Bandsintown'),
      '{Enter}'
    );
    expect(mocks.connect).not.toHaveBeenCalled();
    expect(mocks.toast.error).toHaveBeenCalledWith(
      'Please enter your Bandsintown artist name'
    );
  });

  it('disables the form while a request is in flight', async () => {
    mocks.connectPending.value = true;
    const { container } = render(
      <TourDatesEmptyState profileId='profile-1' hasApiKey />
    );

    expect(
      screen.getByPlaceholderText('Your artist name on Bandsintown')
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Connecting...' })
    ).toBeDisabled();
    await expectNoA11yViolations(container);
  });

  it('stays axe-clean in a right-to-left document', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <TourDatesEmptyState profileId='profile-1' hasApiKey={false} />
      </div>
    );
    expect(screen.getByText('Set Up Bandsintown Integration')).toBeVisible();
    await expectNoA11yViolations(container);
  });
});
