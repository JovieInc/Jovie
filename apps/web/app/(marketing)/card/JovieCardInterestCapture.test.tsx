import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { JovieCardInterestCapture } from './JovieCardInterestCapture';

const useUserSafe = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/useJovieAuth', () => ({ useUserSafe }));
vi.mock('@/components/atoms/InvisibleTurnstile', () => ({
  InvisibleTurnstile: ({
    onToken,
  }: {
    readonly onToken: (token: string) => void;
  }) => {
    useEffect(() => onToken('test-token'), [onToken]);
    return null;
  },
  isTurnstileClientBypassed: () => true,
  isTurnstileClientConfigured: () => false,
}));

describe('JovieCardInterestCapture', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useUserSafe.mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
      user: { primaryEmailAddress: { emailAddress: 'founder@example.com' } },
    });
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ state: 'confirmation_required' }),
    });
  });

  it('reuses signed-in email and persists stable feature/source/state attribution', async () => {
    render(<JovieCardInterestCapture />);

    expect(screen.getByLabelText('Email Address')).toHaveValue(
      'founder@example.com'
    );
    fireEvent.submit(screen.getByTestId('changelog-subscribe-form'));

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/changelog/subscribe',
        expect.objectContaining({
          body: JSON.stringify({
            email: 'founder@example.com',
            turnstileToken: 'test-token',
            source: 'marketing:/card:coming-soon',
          }),
        })
      )
    );
    expect(
      screen.getByRole('heading', { name: 'Check your email' })
    ).toBeVisible();
    expect(
      screen.getAllByText(
        'Confirm your email to receive Jovie Card access updates.'
      )[1]
    ).toBeVisible();
  });

  it('reports an already-requested email honestly', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ state: 'subscribed' }),
    } as Response);
    render(<JovieCardInterestCapture />);
    fireEvent.submit(screen.getByTestId('changelog-subscribe-form'));

    expect(
      await screen.findByRole('heading', { name: 'You’re on the list' })
    ).toBeVisible();
    expect(
      screen.getByText('This email already receives Jovie product updates.')
    ).toBeVisible();
  });
});
