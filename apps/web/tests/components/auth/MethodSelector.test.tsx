import { render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { MethodSelector } from '@/components/auth/forms/MethodSelector';
import { FeatureFlagsProvider } from '@/lib/feature-flags/client';
import { FEATURE_FLAG_KEYS } from '@/lib/feature-flags/shared';

describe('MethodSelector', () => {
  const commonProps = {
    onEmailClick: vi.fn(),
    onGoogleClick: vi.fn(),
    onSpotifyClick: vi.fn(),
    loadingState: { type: 'idle' as const },
    error: null,
  };

  const renderWithFlags = (
    ui: ReactElement,
    gates: Record<string, boolean>
  ) => {
    return render(
      <FeatureFlagsProvider bootstrap={{ gates }}>{ui}</FeatureFlagsProvider>
    );
  };

  it('renders a single Spotify CTA and demoted secondary links for signup when flag is enabled', () => {
    renderWithFlags(<MethodSelector {...commonProps} mode='signup' />, {
      [FEATURE_FLAG_KEYS.SPOTIFY_OAUTH]: true,
    });

    expect(
      screen.getByRole('button', { name: 'Continue with Spotify' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'or continue with Google' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'or use email' })
    ).toBeInTheDocument();
  });

  it('keeps Google first for signin', () => {
    render(<MethodSelector {...commonProps} mode='signin' />);

    const buttons = screen.getAllByRole('button');
    expect(buttons[0]).toHaveTextContent('Continue with Google');
  });

  it('shows Spotify when the flag is enabled', () => {
    renderWithFlags(<MethodSelector {...commonProps} mode='signin' />, {
      [FEATURE_FLAG_KEYS.SPOTIFY_OAUTH]: true,
    });

    const buttons = screen.getAllByRole('button');
    expect(buttons[0]).toHaveTextContent('Continue with Google');
    expect(buttons[1]).toHaveTextContent('Continue with email');
    expect(buttons[2]).toHaveTextContent('Continue with Spotify');
  });

  it('keeps Spotify as the primary signup CTA even when last method is email', () => {
    renderWithFlags(
      <MethodSelector {...commonProps} mode='signup' lastMethod='email' />,
      {
        [FEATURE_FLAG_KEYS.SPOTIFY_OAUTH]: true,
      }
    );

    expect(
      screen.getByRole('button', { name: 'Continue with Spotify' })
    ).toBeInTheDocument();
    expect(
      screen.queryByText('You used email last time')
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'or continue with Google' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'or use email' })
    ).toBeInTheDocument();
  });

  it('keeps Google first for signup when Spotify flag is disabled', () => {
    render(<MethodSelector {...commonProps} mode='signup' />);

    const buttons = screen.getAllByRole('button');
    expect(buttons[0]).toHaveTextContent('Continue with Google');
  });
});
