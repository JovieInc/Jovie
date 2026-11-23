import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const track = vi.hoisted(() => vi.fn());
vi.mock('@/lib/analytics', () => ({ track }));

import { ViewAnalytics, ViewSignupCard } from './ViewAnalytics';

describe('ViewAnalytics', () => {
  beforeEach(() => track.mockClear());

  it('tracks a view with the signed-in flag', () => {
    render(<ViewAnalytics signedIn />);
    expect(track).toHaveBeenCalledWith('shared_view_viewed', {
      signedIn: true,
    });
  });

  it('links Sign up with ref=view and tracks the click', () => {
    render(<ViewSignupCard />);
    const signUp = screen.getByRole('link', { name: 'Sign up' });
    expect(signUp).toHaveAttribute('href', '/signup?ref=view');
    fireEvent.click(signUp);
    expect(track).toHaveBeenCalledWith('shared_view_signup_click');
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
      'href',
      '/signin'
    );
  });
});
