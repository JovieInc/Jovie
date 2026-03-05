import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MethodSelector } from '@/components/auth/forms/MethodSelector';

describe('MethodSelector', () => {
  const commonProps = {
    onEmailClick: vi.fn(),
    onGoogleClick: vi.fn(),
    loadingState: { type: 'idle' as const },
    error: null,
  };

  it('renders Google as primary and Email as secondary for signin', () => {
    render(<MethodSelector {...commonProps} mode='signin' />);

    const buttons = screen.getAllByRole('button');
    expect(buttons[0]).toHaveTextContent('Continue with Google');
    expect(buttons[1]).toHaveTextContent('Continue with email');
  });

  it('renders Google as primary and Email as secondary for signup', () => {
    render(<MethodSelector {...commonProps} mode='signup' />);

    const buttons = screen.getAllByRole('button');
    expect(buttons[0]).toHaveTextContent('Continue with Google');
    expect(buttons[1]).toHaveTextContent('Continue with email');
  });

  it('does not render a Spotify button', () => {
    render(<MethodSelector {...commonProps} mode='signup' />);

    expect(
      screen.queryByRole('button', { name: /spotify/i })
    ).not.toBeInTheDocument();
  });

  it('shows correct heading for signin', () => {
    render(<MethodSelector {...commonProps} mode='signin' />);
    expect(screen.getByText('Log in to Jovie')).toBeInTheDocument();
  });

  it('shows correct heading for signup', () => {
    render(<MethodSelector {...commonProps} mode='signup' />);
    expect(screen.getByText('Create your Jovie account')).toBeInTheDocument();
  });

  it('displays error when provided', () => {
    render(
      <MethodSelector
        {...commonProps}
        mode='signin'
        error='Something went wrong'
      />
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong');
  });

  it('disables buttons when loading', () => {
    render(
      <MethodSelector
        {...commonProps}
        mode='signin'
        loadingState={{ type: 'oauth', provider: 'google' }}
      />
    );

    const buttons = screen.getAllByRole('button');
    for (const btn of buttons) {
      expect(btn).toBeDisabled();
    }
  });
});
