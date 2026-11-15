import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { AddProviderUrlPopover } from './AddProviderUrlPopover';

const accent = 'var(--color-brand-spotify)';

async function openPopover(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Add Spotify link' }));
  return screen.findByPlaceholderText('Paste URL here...');
}

describe('AddProviderUrlPopover', () => {
  it('opens with focus in the URL field and stays axe-clean', async () => {
    const user = userEvent.setup();
    render(
      <AddProviderUrlPopover
        providerLabel='Spotify'
        accent={accent}
        providerKey='spotify'
        onSave={vi.fn()}
      />
    );

    expect(document.body).toHaveTextContent('Add');
    const input = await openPopover(user);
    expect(input).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    await expectNoA11yViolations(document.body);
  });

  it('keeps typed text and focus across a parent rerender', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const { rerender } = render(
      <AddProviderUrlPopover
        providerLabel='Spotify'
        accent={accent}
        providerKey='spotify'
        onSave={onSave}
      />
    );

    const input = await openPopover(user);
    await user.type(input, 'https://open.spotify.com/album/1');
    expect(input).toHaveValue('https://open.spotify.com/album/1');

    rerender(
      <AddProviderUrlPopover
        providerLabel='Spotify'
        accent={accent}
        providerKey='spotify'
        onSave={onSave}
        isSaving={false}
      />
    );
    const after = screen.getByPlaceholderText('Paste URL here...');
    expect(after).toHaveValue('https://open.spotify.com/album/1');
    expect(after).toHaveFocus();
  });

  it('rejects a link from another domain without saving', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(
      <AddProviderUrlPopover
        providerLabel='Spotify'
        accent={accent}
        providerKey='spotify'
        onSave={onSave}
      />
    );

    const input = await openPopover(user);
    await user.type(input, 'https://example.com/track');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(screen.getByText(/URL must be from/)).toBeVisible();
    expect(onSave).not.toHaveBeenCalled();
    expect(input).toHaveValue('https://example.com/track');
    await expectNoA11yViolations(document.body);

    await user.type(input, '1');
    expect(screen.queryByText(/URL must be from/)).not.toBeInTheDocument();
  });

  it('saves a valid link, then clears and closes', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <AddProviderUrlPopover
        providerLabel='Spotify'
        accent={accent}
        providerKey='spotify'
        onSave={onSave}
      />
    );

    const input = await openPopover(user);
    await user.type(input, ' https://open.spotify.com/track/abc ');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSave).toHaveBeenCalledWith('https://open.spotify.com/track/abc');
    await waitFor(() =>
      expect(
        screen.queryByPlaceholderText('Paste URL here...')
      ).not.toBeInTheDocument()
    );
  });

  it('keeps the popover open with the text when the save fails', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockRejectedValue(new Error('offline'));
    render(
      <AddProviderUrlPopover
        providerLabel='Spotify'
        accent={accent}
        onSave={onSave}
      />
    );

    const input = await openPopover(user);
    await user.type(input, 'https://anything.example/link');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(screen.getByPlaceholderText('Paste URL here...')).toHaveValue(
      'https://anything.example/link'
    );
  });

  it('shows a disabled saving state and cancels back to an empty field', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <AddProviderUrlPopover
        providerLabel='Spotify'
        accent={accent}
        onSave={vi.fn()}
        isSaving
      />
    );

    const input = await openPopover(user);
    expect(input).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Saving...' })).toBeDisabled();

    rerender(
      <AddProviderUrlPopover
        providerLabel='Spotify'
        accent={accent}
        onSave={vi.fn()}
      />
    );
    await user.type(
      screen.getByPlaceholderText('Paste URL here...'),
      'https://x.example'
    );
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() =>
      expect(
        screen.queryByPlaceholderText('Paste URL here...')
      ).not.toBeInTheDocument()
    );

    await openPopover(user);
    expect(screen.getByPlaceholderText('Paste URL here...')).toHaveValue('');
  });
});
