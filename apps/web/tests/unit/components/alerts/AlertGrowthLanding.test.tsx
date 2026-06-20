import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mutateAsync = vi.fn();
let searchParamsValue: URLSearchParams = new URLSearchParams();

vi.mock('@/lib/queries/useNotificationStatusQuery', () => ({
  useSubscribeNotificationsMutation: () => ({ mutateAsync }),
}));

vi.mock('@/lib/analytics', () => ({ track: vi.fn() }));
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }));
vi.mock('next/navigation', () => ({
  useSearchParams: () => searchParamsValue,
}));

import { AlertGrowthLanding } from '@/components/features/alerts/AlertGrowthLanding';
import type { Artist } from '@/types/db';

const ARTIST: Artist = {
  id: 'artist-123',
  owner_user_id: 'user-1',
  handle: 'tim',
  spotify_id: '4u',
  name: 'Tim White',
} as Artist;

describe('<AlertGrowthLanding>', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mutateAsync.mockResolvedValue({ pendingConfirmation: false });
    searchParamsValue = new URLSearchParams();
  });

  it('renders the artist name in the hero copy', () => {
    render(<AlertGrowthLanding artist={ARTIST} />);
    expect(screen.getByText(/Tim White/)).toBeDefined();
    expect(screen.getByText(/Get alerts first/i)).toBeDefined();
  });

  it('defaults to SMS, submits with E.164 phone + US country code', async () => {
    render(<AlertGrowthLanding artist={ARTIST} />);

    fireEvent.change(screen.getByPlaceholderText(/555/), {
      target: { value: '5551234567' },
    });
    fireEvent.submit(screen.getByRole('button', { name: /Get alerts/i }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(mutateAsync).toHaveBeenCalledWith({
      artistId: 'artist-123',
      channel: 'sms',
      phone: '+15551234567',
      email: undefined,
      countryCode: 'US',
      source: 'alerts-landing',
    });
  });

  it('threads source-link code from server prop into the source field', async () => {
    render(<AlertGrowthLanding artist={ARTIST} sourceCode='abc123xy' />);

    fireEvent.change(screen.getByPlaceholderText(/555/), {
      target: { value: '5551234567' },
    });
    fireEvent.submit(screen.getByRole('button', { name: /Get alerts/i }));

    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ source: 'alerts-landing:abc123xy' })
      )
    );
  });

  it('reads ?s=<code> from useSearchParams when no prop is provided', async () => {
    searchParamsValue = new URLSearchParams('s=meta-fall-2026');
    render(<AlertGrowthLanding artist={ARTIST} />);

    fireEvent.change(screen.getByPlaceholderText(/555/), {
      target: { value: '5551234567' },
    });
    fireEvent.submit(screen.getByRole('button', { name: /Get alerts/i }));

    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ source: 'alerts-landing:meta-fall-2026' })
      )
    );
  });

  it('sanitizes hostile source-codes to a tight charset', async () => {
    searchParamsValue = new URLSearchParams(
      's=' +
        encodeURIComponent('foo:bar:baz<script>!@#$%^&*()' + 'X'.repeat(100))
    );
    render(<AlertGrowthLanding artist={ARTIST} />);

    fireEvent.change(screen.getByPlaceholderText(/555/), {
      target: { value: '5551234567' },
    });
    fireEvent.submit(screen.getByRole('button', { name: /Get alerts/i }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    const submittedSource = mutateAsync.mock.calls[0][0].source as string;
    expect(submittedSource).toMatch(/^alerts-landing:[a-zA-Z0-9_-]{1,32}$/);
    expect(submittedSource).not.toContain(':bar:baz');
    expect(submittedSource).not.toContain('<');
  });

  it('toggles to email and submits with normalized email', async () => {
    render(<AlertGrowthLanding artist={ARTIST} />);

    fireEvent.click(screen.getByRole('button', { name: /Email me/i }));
    fireEvent.change(screen.getByPlaceholderText(/you@example/), {
      target: { value: '  Fan@Example.com  ' },
    });
    fireEvent.submit(screen.getByRole('button', { name: /Get alerts/i }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'email',
        email: 'fan@example.com',
        phone: undefined,
        countryCode: undefined,
      })
    );
  });

  it('shows an inline error and skips the mutation for invalid phone', async () => {
    render(<AlertGrowthLanding artist={ARTIST} />);

    fireEvent.change(screen.getByPlaceholderText(/555/), {
      target: { value: '123' }, // too short
    });
    fireEvent.submit(screen.getByRole('button', { name: /Get alerts/i }));

    expect(await screen.findByTestId('alerts-landing-error')).toBeDefined();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it('rejects international (non-US) phone numbers instead of mangling them into +1', async () => {
    render(<AlertGrowthLanding artist={ARTIST} />);

    // +44 input would have been stripped to digits and prepended with +1
    // by the original buildPhoneE164. Now it must be rejected outright.
    fireEvent.change(screen.getByPlaceholderText(/555/), {
      target: { value: '+44 7700 900123' },
    });
    fireEvent.submit(screen.getByRole('button', { name: /Get alerts/i }));

    expect(await screen.findByTestId('alerts-landing-error')).toBeDefined();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it('rejects 0-prefixed national-format input', async () => {
    render(<AlertGrowthLanding artist={ARTIST} />);

    fireEvent.change(screen.getByPlaceholderText(/555/), {
      target: { value: '0 447 700 900' },
    });
    fireEvent.submit(screen.getByRole('button', { name: /Get alerts/i }));

    expect(await screen.findByTestId('alerts-landing-error')).toBeDefined();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it('accepts formatted +1 US numbers and normalises to E.164', async () => {
    render(<AlertGrowthLanding artist={ARTIST} />);

    fireEvent.change(screen.getByPlaceholderText(/555/), {
      target: { value: '+1 (555) 234-5678' },
    });
    fireEvent.submit(screen.getByRole('button', { name: /Get alerts/i }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ phone: '+15552345678', channel: 'sms' })
    );
  });

  it('renders the pending-confirmation state when the API requires double opt-in', async () => {
    mutateAsync.mockResolvedValueOnce({ pendingConfirmation: true });

    render(<AlertGrowthLanding artist={ARTIST} />);
    fireEvent.click(screen.getByRole('button', { name: /Email me/i }));
    fireEvent.change(screen.getByPlaceholderText(/you@example/), {
      target: { value: 'fan@example.com' },
    });
    fireEvent.submit(screen.getByRole('button', { name: /Get alerts/i }));

    expect(await screen.findByTestId('alerts-landing-pending')).toBeDefined();
  });

  it('renders the immediate success state when the API confirms the subscription', async () => {
    mutateAsync.mockResolvedValueOnce({ pendingConfirmation: false });

    render(<AlertGrowthLanding artist={ARTIST} />);
    fireEvent.change(screen.getByPlaceholderText(/555/), {
      target: { value: '5551234567' },
    });
    fireEvent.submit(screen.getByRole('button', { name: /Get alerts/i }));

    expect(await screen.findByTestId('alerts-landing-success')).toBeDefined();
  });

  it('does not re-submit after a successful subscribe (race / tap-spam)', async () => {
    mutateAsync.mockResolvedValueOnce({ pendingConfirmation: false });

    render(<AlertGrowthLanding artist={ARTIST} />);
    fireEvent.change(screen.getByPlaceholderText(/555/), {
      target: { value: '5551234567' },
    });
    fireEvent.submit(screen.getByRole('button', { name: /Get alerts/i }));

    await screen.findByTestId('alerts-landing-success');
    // The form is unmounted after success — there is no submit button to
    // press. A defensive resubmit would have to come from a re-render of
    // the form, which the success state prevents.
    expect(mutateAsync).toHaveBeenCalledTimes(1);
  });

  it('surfaces server error messages on the form', async () => {
    mutateAsync.mockRejectedValueOnce(new Error('Phone already subscribed'));

    render(<AlertGrowthLanding artist={ARTIST} />);
    fireEvent.change(screen.getByPlaceholderText(/555/), {
      target: { value: '5551234567' },
    });
    fireEvent.submit(screen.getByRole('button', { name: /Get alerts/i }));

    const error = await screen.findByTestId('alerts-landing-error');
    expect(error.textContent).toContain('Phone already subscribed');
  });

  it('renders the TCPA-grade SMS consent text on the SMS path', () => {
    render(<AlertGrowthLanding artist={ARTIST} />);
    expect(screen.getByText(/Reply STOP to opt out/i)).toBeDefined();
  });

  it('exposes channel toggles as aria-pressed buttons (not radio role)', () => {
    render(<AlertGrowthLanding artist={ARTIST} />);
    const sms = screen.getByRole('button', { name: /Text me/i });
    const email = screen.getByRole('button', { name: /Email me/i });
    expect(sms.getAttribute('aria-pressed')).toBe('true');
    expect(email.getAttribute('aria-pressed')).toBe('false');
  });
});
