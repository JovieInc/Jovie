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

  it(
    'renders Google as primary and email as secondary for signup',
    { timeout: 15_000 },
    () => {
      render(<MethodSelector {...commonProps} mode='signup' />);

      const buttons = screen.getAllByRole('button');
      expect(buttons[0]).toHaveTextContent('Continue with Google');
      expect(buttons[1]).toHaveTextContent('Continue with email');
    }
  );

  it('renders Google as primary and email as secondary for signin', () => {
    render(<MethodSelector {...commonProps} mode='signin' />);

    const buttons = screen.getAllByRole('button');
    expect(buttons[0]).toHaveTextContent('Continue with Google');
    expect(buttons[1]).toHaveTextContent('Continue with email');
  });

  it('shows signup heading for signup mode', () => {
    render(<MethodSelector {...commonProps} mode='signup' />);

    expect(screen.getByText('Create your Jovie account')).toBeInTheDocument();
  });

  it('shows signin heading for signin mode', () => {
    render(<MethodSelector {...commonProps} mode='signin' />);

    expect(screen.getByText('Log in to Jovie')).toBeInTheDocument();
  });

  it('displays error message when error is provided', () => {
    render(
      <MethodSelector
        {...commonProps}
        mode='signin'
        error='Something went wrong'
      />
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong');
  });

  it('does not display error when error is null', () => {
    render(<MethodSelector {...commonProps} mode='signin' />);

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
