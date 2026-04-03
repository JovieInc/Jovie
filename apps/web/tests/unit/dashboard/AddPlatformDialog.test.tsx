import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AddPlatformDialog } from '@/features/dashboard/organisms/dsp-presence/AddPlatformDialog';

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
    expect(screen.getByRole('alert')).toHaveTextContent('URL must use HTTPS');
    expect(toastSuccessMock).not.toHaveBeenCalled();
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
});
