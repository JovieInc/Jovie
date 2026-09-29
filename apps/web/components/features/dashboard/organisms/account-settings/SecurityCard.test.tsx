import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SecurityCard } from './SecurityCard';

const fetchWithTimeout = vi.fn();
const signOut = vi.fn();

vi.mock('@/lib/queries', () => ({
  fetchWithTimeout: (...args: unknown[]) => fetchWithTimeout(...args),
}));

vi.mock('@/hooks/useJovieAuth', () => ({
  signOut: (...args: unknown[]) => signOut(...args),
}));

vi.mock('@/lib/hooks/useNotifications', () => ({
  useNotifications: () => ({
    success: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: vi.fn(),
}));

const overview = {
  email: 'artist@example.com',
  emailVerified: true,
  hasPassword: true,
  passkeyCount: 0,
  activeSessionCount: 2,
  score: 60,
  factors: [
    { id: 'verified_email', label: 'Verified recovery email', active: true },
    { id: 'password', label: 'Password set', active: true },
    { id: 'passkey', label: 'Passkey added', active: false },
  ],
  recentSessions: [
    {
      id: 'session-1',
      ipAddress: '203.0.113.7',
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
      createdAt: '2026-09-28T00:00:00Z',
      lastActiveAt: '2026-09-29T00:00:00Z',
    },
  ],
  recentEvents: [
    {
      id: 'event-1',
      type: 'links_restored',
      createdAt: '2026-09-28T12:00:00Z',
      metadata: {},
    },
  ],
};

describe('SecurityCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows an error state when the overview request fails', async () => {
    fetchWithTimeout.mockRejectedValue(new Error('boom'));

    render(<SecurityCard />);

    expect(
      await screen.findByText('Unable to load your security status right now.')
    ).toBeVisible();
  });

  it('renders the score, protections, and recent activity', async () => {
    fetchWithTimeout.mockResolvedValue(overview);

    render(<SecurityCard />);

    expect(await screen.findByText('Security score')).toBeTruthy();
    expect(screen.getByText('60/100')).toBeTruthy();
    expect(screen.getByText('Verified recovery email')).toBeTruthy();
    expect(screen.getByText('Passkey added')).toBeTruthy();
    // Required sign-in alerts are shown as always-on.
    expect(screen.getByText('Sign-in and takeover alerts')).toBeTruthy();
    expect(screen.getByText('Always On')).toBeTruthy();
    // Recent sign-ins render device + IP.
    expect(screen.getByText(/203\.0\.113\.7/)).toBeTruthy();
    // Audited security events render a friendly label.
    expect(
      screen.getByText('Links restored from a previous version')
    ).toBeTruthy();
  });

  it('runs the panic action and signs the user out', async () => {
    fetchWithTimeout.mockResolvedValue(overview);
    const user = userEvent.setup();

    render(<SecurityCard />);

    const panicButton = await screen.findByRole('button', {
      name: 'Secure my account',
    });
    await user.click(panicButton);

    const confirm = await screen.findByRole('button', {
      name: 'Secure my account',
    });
    fetchWithTimeout.mockResolvedValue({ ok: true });
    await user.click(confirm);

    await waitFor(() => {
      expect(fetchWithTimeout).toHaveBeenCalledWith(
        '/api/account/security/panic',
        expect.objectContaining({ method: 'POST' })
      );
    });
    await waitFor(() => {
      expect(signOut).toHaveBeenCalled();
    });
  });
});
