import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/components/features/auth/AuthLayout', () => ({
  AuthLayout: ({
    children,
    formTitle,
    showFormTitle,
    showFooterPrompt,
    chrome,
  }: {
    children: ReactNode;
    formTitle: string;
    showFormTitle?: boolean;
    showFooterPrompt?: boolean;
    chrome?: string;
  }) => (
    <div
      data-testid='auth-layout'
      data-form-title={formTitle}
      data-show-form-title={showFormTitle ? 'true' : 'false'}
      data-show-footer-prompt={showFooterPrompt ? 'true' : 'false'}
      data-auth-chrome={chrome}
    >
      {children}
    </div>
  ),
}));

import { AuthPageSkeleton } from '@/components/features/auth/AuthPageSkeleton';

describe('AuthPageSkeleton', () => {
  it('renders the auth form skeleton inside the shared auth layout contract', () => {
    render(
      <AuthPageSkeleton
        formTitle='Sign in'
        showFormTitle={false}
        chrome='splash-b'
      />
    );

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
    expect(screen.getByTestId('auth-layout')).toHaveAttribute(
      'data-auth-chrome',
      'splash-b'
    );
  });
});
