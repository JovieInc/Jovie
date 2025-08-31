import { render, screen } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

let isLoaded = true;
const signInMock = vi.fn();
let params = new URLSearchParams();

vi.mock('@clerk/nextjs', () => ({
  SignIn: (props: any) => {
    signInMock(props);
    return <div data-testid='sign-in' />;
  },
  ClerkLoaded: ({ children }: { children: React.ReactNode }) =>
    isLoaded ? <>{children}</> : null,
  ClerkLoading: ({ children }: { children: React.ReactNode }) =>
    isLoaded ? null : <div data-testid='spinner'>{children}</div>,
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => params,
}));

import SignInPage from '@/app/(auth)/sign-in/[[...rest]]/page';

describe('SignInPage redirect logic', () => {
  beforeEach(() => {
    signInMock.mockClear();
    params = new URLSearchParams();
    isLoaded = true;
  });

  it('uses redirect_url query param when present', () => {
    params = new URLSearchParams('redirect_url=%2Fprofile');
    render(<SignInPage />);
    expect(signInMock).toHaveBeenCalledWith(
      expect.objectContaining({
        redirectUrl: '/profile',
        afterSignInUrl: '/profile',
        afterSignUpUrl: '/profile',
      })
    );
  });

  it('falls back to artistId when redirect_url is missing', () => {
    params = new URLSearchParams('artistId=123');
    render(<SignInPage />);
    expect(signInMock).toHaveBeenCalledWith(
      expect.objectContaining({
        redirectUrl: '/dashboard?artistId=123',
        afterSignInUrl: '/dashboard?artistId=123',
        afterSignUpUrl: '/dashboard?artistId=123',
      })
    );
  });

  it('shows spinner while Clerk is loading', () => {
    isLoaded = false;
    render(<SignInPage />);
    expect(screen.getAllByTestId('spinner').length).toBeGreaterThan(0);
    expect(signInMock).not.toHaveBeenCalled();
  });
});
