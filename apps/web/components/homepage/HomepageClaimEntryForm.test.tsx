import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HomepageClaimEntryForm } from './HomepageClaimEntryForm';

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

describe('HomepageClaimEntryForm', () => {
  beforeEach(() => {
    push.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('keeps a valid handle on handle= for /start', () => {
    render(<HomepageClaimEntryForm />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Your handle' }), {
      target: { value: 'lunaharbor' },
    });
    fireEvent.click(screen.getByTestId('homepage-close-cta'));
    const target = new URL(push.mock.calls[0][0], 'https://jov.ie');
    expect(target.pathname).toBe('/start');
    expect(target.searchParams.get('handle')).toBe('lunaharbor');
    expect(target.searchParams.get('starter_prompt')).toBe(
      'I want to claim jov.ie/lunaharbor.'
    );
  });

  it('never emits handle= for a display name; seeds Spotify search instead', () => {
    render(<HomepageClaimEntryForm />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Your handle' }), {
      target: { value: 'Taylor Swift' },
    });
    fireEvent.click(screen.getByTestId('homepage-close-cta'));
    const target = new URL(push.mock.calls[0][0], 'https://jov.ie');
    expect(target.pathname).toBe('/start');
    expect(target.searchParams.get('handle')).toBeNull();
    expect(target.searchParams.get('starter_prompt')).toBe(
      'I want to claim my profile. Find Taylor Swift on Spotify.'
    );
  });

  it('keeps native GET fallback attributes for no-JS', () => {
    render(<HomepageClaimEntryForm />);
    const form = screen.getByTestId('homepage-claim-entry');
    expect(form).toHaveAttribute('method', 'get');
    expect(form).toHaveAttribute('action');
    expect(
      screen.getByRole('textbox', { name: 'Your handle' })
    ).toHaveAttribute('pattern', '[A-Za-z0-9._-]{3,30}');
  });

  it('does not double-navigate while a handoff is in flight', async () => {
    render(<HomepageClaimEntryForm />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Your handle' }), {
      target: { value: 'lunaharbor' },
    });
    fireEvent.click(screen.getByTestId('homepage-close-cta'));
    await act(async () => {
      fireEvent.click(screen.getByTestId('homepage-close-cta'));
    });
    expect(push).toHaveBeenCalledTimes(1);
  });
});
