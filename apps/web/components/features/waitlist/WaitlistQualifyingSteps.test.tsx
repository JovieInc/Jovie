import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WaitlistRoleForm } from './WaitlistRoleForm';

const ARTIST_ID = '4Z8W4fKeB5YxbusRsdQVPb';

vi.mock('@/components/atoms/InvisibleTurnstile', () => ({
  InvisibleTurnstile: () => <span hidden data-testid='turnstile-mock' />,
  isTurnstileClientBypassed: () => true,
  isTurnstileClientConfigured: () => false,
}));
vi.mock('@/lib/analytics', () => ({ track: vi.fn() }));
vi.mock('@/components/atoms/SocialIcon', () => ({
  SocialIcon: () => <span />,
}));
vi.mock('@/lib/queries', () => ({
  useArtistSearchQuery: () => ({
    results: [
      {
        id: ARTIST_ID,
        name: 'Maya Vale',
        url: `https://open.spotify.com/artist/${ARTIST_ID}`,
        followers: 12_300,
        imageUrl: null,
      },
    ],
    state: 'success',
    search: vi.fn(),
    clear: vi.fn(),
  }),
}));

function startAsArtist() {
  render(<WaitlistRoleForm qualify />);
  fireEvent.click(screen.getByRole('radio', { name: 'Artist' }));
  fireEvent.change(screen.getByLabelText('Email address'), {
    target: { value: 'maya@example.com' },
  });
}

function submit() {
  fireEvent.submit(screen.getByTestId('waitlist-role-form'));
}

function sentBody() {
  const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  return JSON.parse(String(init.body)) as Record<string, unknown>;
}

const fetchMock = vi.fn();

describe('WaitlistRoleForm request-access questions', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ state: 'joined' }), { status: 201 })
    );
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('asks an artist which artist they are, their last growth attempt and their promo spend, then sends all three', async () => {
    startAsArtist();
    expect(screen.getByTestId('waitlist-step-counter')).toHaveTextContent(
      'Step 1 of 4'
    );
    expect(screen.getByRole('button', { name: 'Continue' })).toBeVisible();
    submit();
    await screen.findByTestId('waitlist-qualifying-step');

    expect(screen.getByTestId('waitlist-step-counter')).toHaveTextContent(
      'Step 2 of 4'
    );
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(/search spotify/i), {
      target: { value: 'Maya' },
    });
    fireEvent.click(screen.getByText('Maya Vale'));
    submit();

    expect(screen.getByTestId('waitlist-step-counter')).toHaveTextContent(
      'Step 3 of 4'
    );
    fireEvent.change(screen.getByLabelText(/last thing you did/i), {
      target: { value: 'Ran a pre-save. About 40 sign-ups.' },
    });
    submit();

    expect(screen.getByTestId('waitlist-step-counter')).toHaveTextContent(
      'Step 4 of 4'
    );
    fireEvent.click(screen.getByRole('radio', { name: 'Under $50 a month' }));
    fireEvent.click(screen.getByRole('button', { name: 'Request access' }));

    await waitFor(() =>
      expect(screen.getByTestId('waitlist-role-form-joined')).toBeVisible()
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sentBody()).toMatchObject({
      email: 'maya@example.com',
      role: 'artist',
      spotifyArtistId: ARTIST_ID,
      momTest: {
        lastGrowthAttempt: 'Ran a pre-save. About 40 sign-ups.',
        promoSpend: 'under_50',
      },
    });
  });

  it('sends only email and role when every question is skipped', async () => {
    startAsArtist();
    submit();
    await screen.findByTestId('waitlist-qualifying-step');
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));

    await waitFor(() =>
      expect(screen.getByTestId('waitlist-role-form-joined')).toBeVisible()
    );
    const body = sentBody();
    expect(body).toMatchObject({ email: 'maya@example.com', role: 'artist' });
    expect(body).not.toHaveProperty('spotifyArtistId');
    expect(body).not.toHaveProperty('momTest');
  });

  it('goes back a step without losing the email', async () => {
    startAsArtist();
    submit();
    await screen.findByTestId('waitlist-qualifying-step');
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByTestId('waitlist-step-counter')).toHaveTextContent(
      'Step 1 of 4'
    );
    expect(screen.getByLabelText('Email address')).toHaveValue(
      'maya@example.com'
    );
  });

  it('sends a manager straight through with no questions', async () => {
    render(<WaitlistRoleForm qualify />);
    fireEvent.click(screen.getByRole('radio', { name: 'Manager' }));
    fireEvent.change(screen.getByLabelText('Email address'), {
      target: { value: 'manager@example.com' },
    });
    expect(screen.queryByTestId('waitlist-step-counter')).toBeNull();
    submit();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(sentBody()).not.toHaveProperty('momTest');
  });

  it('keeps the chosen artist when the artist goes back to that step', async () => {
    startAsArtist();
    submit();
    await screen.findByTestId('waitlist-qualifying-step');
    fireEvent.change(screen.getByLabelText(/search spotify/i), {
      target: { value: 'Maya' },
    });
    fireEvent.click(screen.getByText('Maya Vale'));
    submit();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByTestId('waitlist-chosen-artist')).toHaveTextContent(
      'Maya Vale'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Change' }));
    expect(screen.queryByTestId('waitlist-chosen-artist')).toBeNull();
    expect(screen.getByLabelText(/search spotify/i)).toBeVisible();
  });

  it('keeps the link field open while an artist types a Spotify link by hand', async () => {
    startAsArtist();
    submit();
    await screen.findByTestId('waitlist-qualifying-step');
    fireEvent.change(screen.getByLabelText(/search spotify/i), {
      target: { value: 'Maya' },
    });
    fireEvent.click(screen.getByRole('button', { name: /manually add url/i }));
    fireEvent.change(screen.getByLabelText('Spotify link'), {
      target: { value: 'h' },
    });
    expect(screen.queryByTestId('waitlist-chosen-artist')).toBeNull();
    expect(screen.getByLabelText('Spotify link')).toHaveValue('h');
  });

  it('stops on a pasted link that names no artist instead of dropping it', async () => {
    startAsArtist();
    submit();
    await screen.findByTestId('waitlist-qualifying-step');
    fireEvent.change(screen.getByLabelText(/search spotify/i), {
      target: { value: 'Maya' },
    });
    fireEvent.click(screen.getByRole('button', { name: /manually add url/i }));
    fireEvent.change(screen.getByLabelText('Spotify link'), {
      target: { value: 'https://open.spotify.com/album/1A2B3C' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(
      await screen.findByText(/not a Spotify artist/i)
    ).toBeInTheDocument();
    expect(screen.getByTestId('waitlist-qualifying-step')).toHaveAttribute(
      'data-step',
      'artist'
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('drops a leftover link that names no artist when the artist question opens again', async () => {
    startAsArtist();
    submit();
    await screen.findByTestId('waitlist-qualifying-step');
    fireEvent.change(screen.getByLabelText(/search spotify/i), {
      target: { value: 'Maya' },
    });
    fireEvent.click(screen.getByRole('button', { name: /manually add url/i }));
    fireEvent.change(screen.getByLabelText('Spotify link'), {
      target: { value: 'https://open.spotify.com/album/1A2B3C' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    submit();
    await screen.findByTestId('waitlist-qualifying-step');
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.queryByText(/not a Spotify artist/i)).toBeNull();
    expect(screen.getByTestId('waitlist-qualifying-step')).toHaveAttribute(
      'data-step',
      'growth'
    );
  });
});
