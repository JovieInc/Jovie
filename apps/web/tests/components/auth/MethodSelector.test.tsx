import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MethodSelector } from '@/components/auth/forms/MethodSelector';

describe('MethodSelector', () => {
  const commonProps = {
    onEmailClick: vi.fn(),
    onGoogleClick: vi.fn(),
    onSpotifyClick: vi.fn(),
    loadingState: { type: 'idle' as const },
    error: null,
  };

  it('prioritizes Spotify for signup', () => {
    render(<MethodSelector {...commonProps} mode='signup' />);

    const buttons = screen.getAllByRole('button');
    expect(buttons[0]).toHaveTextContent('Continue with Spotify');
  });

  it('keeps Google first for signin', () => {
    render(<MethodSelector {...commonProps} mode='signin' />);

    const buttons = screen.getAllByRole('button');
    expect(buttons[0]).toHaveTextContent('Continue with Google');
  });
});
