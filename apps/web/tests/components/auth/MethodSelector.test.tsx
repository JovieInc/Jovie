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

  it('prioritizes Spotify then Google then email for signup when flag is enabled', () => {
    renderWithFlags(<MethodSelector {...commonProps} mode='signup' />, {
      [FEATURE_FLAG_KEYS.SPOTIFY_OAUTH]: true,
    });

    const buttons = screen.getAllByRole('button');
    expect(buttons[0]).toHaveTextContent('Continue with Spotify');
    expect(buttons[1]).toHaveTextContent('Continue with Google');
    expect(buttons[2]).toHaveTextContent('Continue with email');
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

  it('keeps last method override for returning users', () => {
    renderWithFlags(
      <MethodSelector {...commonProps} mode='signup' lastMethod='email' />,
      {
        [FEATURE_FLAG_KEYS.SPOTIFY_OAUTH]: true,
      }
    );

    const buttons = screen.getAllByRole('button');
    expect(buttons[0]).toHaveTextContent('Continue with email');
  });
});
