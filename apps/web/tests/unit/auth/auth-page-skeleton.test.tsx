import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/features/auth/AuthLayout', () => ({
  AuthLayout: ({
    children,
    formTitle,
    showFormTitle,
    showFooterPrompt,
  }: {
    children: ReactNode;
    formTitle: string;
    showFormTitle?: boolean;
    showFooterPrompt?: boolean;
  }) => (
    <div
      data-testid='auth-layout'
      data-form-title={formTitle}
      data-show-form-title={showFormTitle ? 'true' : 'false'}
      data-show-footer-prompt={showFooterPrompt ? 'true' : 'false'}
    >
      {children}
    </div>
  ),
}));

describe('AuthPageSkeleton', () => {
  it('renders the auth form skeleton inside the shared auth layout contract', async () => {
    const { AuthPageSkeleton } = await import(
      '@/features/auth/AuthPageSkeleton'
    );

    render(<AuthPageSkeleton formTitle='Sign in' showFormTitle={false} />);

    expect(screen.getByTestId('auth-layout')).toHaveAttribute(
      'data-form-title',
      'Sign in'
    );
    expect(screen.getByTestId('auth-layout')).toHaveAttribute(
      'data-show-form-title',
      'false'
    );
    expect(screen.getByTestId('auth-layout')).toHaveAttribute(
      'data-show-footer-prompt',
      'false'
    );
  });
});
