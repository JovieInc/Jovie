import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { clerkSignInMock, searchParamsState } = vi.hoisted(() => ({
  clerkSignInMock: vi.fn(),
  searchParamsState: { value: '' },
}));

vi.mock('@clerk/nextjs', () => ({
  SignIn: (props: unknown) => {
    clerkSignInMock(props);
    return <div data-testid='clerk-sign-in' />;
  },
  SignUp: () => <div data-testid='clerk-sign-up' />,
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(searchParamsState.value),
}));

import { AuthShell } from '@/features/auth';

describe('AuthShell Clerk appearance guards', () => {
  beforeEach(() => {
    clerkSignInMock.mockReset();
    searchParamsState.value = '';
  });

  it('keeps required provider and last-used badge layout guards after caller overrides', async () => {
    render(
      <AuthShell
        mode='sign-in'
        appearance={{
          elements: {
            lastAuthenticationStrategyBadge: {
              position: 'absolute',
              transform: 'translate(10px, -50%)',
            },
            socialButtonsBlockButton: {
              backgroundColor: 'rgb(1, 2, 3)',
              display: 'flex',
              overflow: 'hidden',
            },
            socialButtonsBlockButton__facebook: 'block',
          },
        }}
      />
    );

    await waitFor(() => {
      expect(clerkSignInMock).toHaveBeenCalledTimes(1);
    });

    const signInProps = clerkSignInMock.mock.calls[0]?.[0] as {
      readonly appearance?: {
        readonly elements?: Record<string, unknown>;
      };
    };
    const elements = signInProps.appearance?.elements;

    expect(elements?.socialButtonsBlockButton).toEqual(
      expect.objectContaining({
        backgroundColor: 'rgb(1, 2, 3)',
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) auto',
        overflow: 'visible',
      })
    );
    expect(elements?.lastAuthenticationStrategyBadge).toEqual(
      expect.objectContaining({
        gridColumn: '2',
        order: 2,
        position: 'static',
        transform: 'none',
        whiteSpace: 'nowrap',
      })
    );
    expect(elements?.socialButtonsBlockButton__facebook).toBe('hidden');
  });
});
