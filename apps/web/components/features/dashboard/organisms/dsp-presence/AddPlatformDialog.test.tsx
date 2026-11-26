import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { AddPlatformDialog } from './AddPlatformDialog';

const { addManualDspMatchMock, toastSuccessMock } = vi.hoisted(() => ({
  addManualDspMatchMock: vi.fn(),
  toastSuccessMock: vi.fn(),
}));

vi.mock('@jovie/ui', async () => {
  const actual = await vi.importActual<object>('@jovie/ui');
  return {
    ...actual,
    Button: ({ children, ...props }: ComponentProps<'button'>) => (
      <button type='button' {...props}>
        {children}
      </button>
    ),
  };
});

vi.mock('@/app/app/(shell)/dashboard/presence/actions', () => ({
  addManualDspMatch: addManualDspMatchMock,
}));

vi.mock('@/components/organisms/Dialog', () => ({
  Dialog: ({ children, open }: { children: ReactNode; open: boolean }) =>
    open ? <div>{children}</div> : null,
  DialogDescription: ({ children }: { children: ReactNode }) => (
    <p>{children}</p>
  ),
  DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}));

vi.mock('@/features/dashboard/atoms/DspProviderIcon', () => ({
  PROVIDER_LABELS: {
    spotify: 'Spotify',
    apple_music: 'Apple Music',
  },
  DspProviderIcon: ({ provider }: { provider: string }) => (
    <span>{provider}</span>
  ),
}));

vi.mock('sonner', () => ({
  toast: {
    success: toastSuccessMock,
  },
}));

describe('AddPlatformDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps submission disabled until a provider and both fields are filled', async () => {
    const user = userEvent.setup();

    render(
      <AddPlatformDialog
        open
        onClose={() => undefined}
        existingProviderIds={[]}
      />
    );

    await user.click(screen.getByRole('button', { name: /Spotify/ }));

    const submitButton = screen.getByRole('button', { name: 'Add Platform' });
    expect(submitButton).toBeDisabled();

    await user.type(screen.getByLabelText('Artist name'), 'Midnight Echo');
    expect(submitButton).toBeDisabled();

    await user.type(
      screen.getByLabelText('Profile URL'),
      'https://open.spotify.com/artist/123'
    );

    expect(submitButton).toBeEnabled();
  });

  it('shows server-action validation errors inline', async () => {
    const user = userEvent.setup();
    addManualDspMatchMock.mockResolvedValueOnce({
      success: false,
      error: 'URL must use HTTPS',
    });

    render(
      <AddPlatformDialog
        open
        onClose={() => undefined}
        existingProviderIds={[]}
      />
    );

    await user.click(screen.getByRole('button', { name: /Spotify/ }));
    await user.type(screen.getByLabelText('Artist name'), 'Midnight Echo');
    await user.type(
      screen.getByLabelText('Profile URL'),
      'https://open.spotify.com/artist/123'
    );
    await user.click(screen.getByRole('button', { name: 'Add Platform' }));

    expect(addManualDspMatchMock).toHaveBeenCalledWith({
      providerId: 'spotify',
      url: 'https://open.spotify.com/artist/123',
      artistName: 'Midnight Echo',
    });
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('URL must use HTTPS');
    expect(toastSuccessMock).not.toHaveBeenCalled();

    // JOV-6773: the inline validation error renders on the error token,
    // not raw red-*.
    expect(alert.className).toContain('text-error');
    expect(alert.className).not.toMatch(/\bred-\d/);
  });

  it('names what failed instead of a bare error when the save throws', async () => {
    const user = userEvent.setup();
    addManualDspMatchMock.mockRejectedValueOnce(new Error('network'));

    render(
      <AddPlatformDialog
        open
        onClose={() => undefined}
        existingProviderIds={[]}
      />
    );

    await user.click(screen.getByRole('button', { name: /Spotify/ }));
    await user.type(screen.getByLabelText('Artist name'), 'Midnight Echo');
    await user.type(
      screen.getByLabelText('Profile URL'),
      'https://open.spotify.com/artist/123'
    );
    await user.click(screen.getByRole('button', { name: 'Add Platform' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "This profile couldn't be added. Check the link and try again."
    );
    expect(screen.queryByText(/Something went wrong/)).toBeNull();
  });

  it('updates the inline error when the form is resubmitted with new input', async () => {
    const user = userEvent.setup();
    addManualDspMatchMock
      .mockResolvedValueOnce({
        success: false,
        error: 'Artist name is required',
      })
      .mockResolvedValueOnce({
        success: false,
        error: 'Invalid URL',
      });

    render(
      <AddPlatformDialog
        open
        onClose={() => undefined}
        existingProviderIds={[]}
      />
    );

    await user.click(screen.getByRole('button', { name: /Spotify/ }));

    const artistName = screen.getByLabelText('Artist name');
    const profileUrl = screen.getByLabelText('Profile URL');
    const submitButton = screen.getByRole('button', { name: 'Add Platform' });

    await user.type(artistName, '   ');
    await user.type(profileUrl, 'https://open.spotify.com/artist/123');
    await user.click(submitButton);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Artist name is required'
    );

    await user.clear(artistName);
    await user.type(artistName, 'Presence QA');
    await user.clear(profileUrl);
    await user.type(profileUrl, 'not-a-valid-url');
    await user.click(submitButton);

    expect(addManualDspMatchMock).toHaveBeenNthCalledWith(2, {
      providerId: 'spotify',
      url: 'not-a-valid-url',
      artistName: 'Presence QA',
    });
    expect(screen.getByRole('alert')).toHaveTextContent('Invalid URL');
  });

  it('keeps typed values and focus through a parent rerender and Escape', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <AddPlatformDialog
        open
        onClose={() => undefined}
        existingProviderIds={[]}
      />
    );

    await user.click(screen.getByRole('button', { name: /Spotify/ }));
    const artistName = screen.getByLabelText('Artist name');
    const profileUrl = screen.getByLabelText('Profile URL');
    await user.type(artistName, 'Midnight Echo');
    await user.type(profileUrl, 'https://open.spotify.com/artist/123');
    rerender(
      <AddPlatformDialog
        open
        onClose={() => undefined}
        existingProviderIds={['deezer']}
      />
    );
    await user.keyboard('{Escape}');

    expect(artistName).toHaveValue('Midnight Echo');
    expect(profileUrl).toHaveValue('https://open.spotify.com/artist/123');
    expect(profileUrl).toHaveFocus();
  });

  it('presses a provider chip as a native button and shows its fields, axe-clean', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <AddPlatformDialog
        open
        onClose={() => undefined}
        existingProviderIds={[]}
      />
    );

    const chip = screen.getByRole('button', { name: /Spotify/ });
    expect(chip).toHaveAttribute('type', 'button');
    expect(chip).toHaveAttribute('aria-pressed', 'false');
    await user.click(chip);

    expect(chip).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('Artist name')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('says every platform is linked when none are left, axe-clean', async () => {
    const { container } = render(
      <AddPlatformDialog
        open
        onClose={() => undefined}
        existingProviderIds={[
          'spotify',
          'apple_music',
          'deezer',
          'youtube_music',
          'tidal',
          'soundcloud',
          'amazon_music',
          'musicbrainz',
          'genius',
          'discogs',
          'allmusic',
        ]}
      />
    );

    expect(
      screen.getByText('All platforms are already linked')
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('closes and resets from the dialog close', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    addManualDspMatchMock.mockResolvedValueOnce({ success: true });
    render(
      <AddPlatformDialog open onClose={onClose} existingProviderIds={[]} />
    );

    await user.click(screen.getByRole('button', { name: /Spotify/ }));
    await user.type(screen.getByLabelText('Artist name'), 'Midnight Echo');
    await user.type(
      screen.getByLabelText('Profile URL'),
      'https://open.spotify.com/artist/123'
    );
    await user.click(screen.getByRole('button', { name: 'Add Platform' }));

    await vi.waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(toastSuccessMock).toHaveBeenCalled();
  });
});
