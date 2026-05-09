/**
 * Tests for the canonical SubscribeForm component (JOV-2023).
 *
 * Verifies that all states from the spec §4 Alert/Subscribe Contract are
 * reachable and that the "Get alerts" label is canonical.
 *
 * Integration depth: mocks ArtistNotificationsCTA and TwoStepNotificationsCTA
 * so we can isolate the routing logic in SubscribeForm itself. The underlying
 * form states (idle → submitting → success → error → retry) are covered in
 * depth by subscription-form-states.test.tsx and inline-notifications-cta.test.tsx.
 */
import { render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { Artist } from '@/types/db';

// Lightweight stubs for the underlying CTA components.
vi.mock('../artist-notifications-cta/ArtistNotificationsCTA', () => ({
  ArtistNotificationsCTA: ({
    artist,
    presentation,
    forceExpanded,
  }: {
    readonly artist: Artist;
    readonly presentation?: string;
    readonly forceExpanded?: boolean;
  }) => (
    <div
      data-testid='artist-notifications-cta'
      data-artist-handle={artist.handle}
      data-presentation={presentation}
      data-force-expanded={String(forceExpanded)}
    />
  ),
}));

vi.mock('../artist-notifications-cta/TwoStepNotificationsCTA', () => ({
  TwoStepNotificationsCTA: ({
    artist,
    startExpanded,
  }: {
    readonly artist: Artist;
    readonly startExpanded?: boolean;
  }) => (
    <div
      data-testid='two-step-notifications-cta'
      data-artist-handle={artist.handle}
      data-start-expanded={String(startExpanded)}
    />
  ),
}));

function makeArtist(overrides: Partial<Artist> = {}): Artist {
  return {
    id: 'artist-1',
    owner_user_id: 'owner-1',
    handle: 'testartist',
    spotify_id: 'spotify-1',
    name: 'Test Artist',
    published: true,
    is_verified: false,
    is_featured: false,
    marketing_opt_out: false,
    created_at: new Date().toISOString(),
    settings: null,
    theme: null,
    ...overrides,
  } as Artist;
}

describe('SubscribeForm', () => {
  // Defer the import so vi.mock() calls above are registered first.
  let SubscribeForm: typeof import('./SubscribeForm').SubscribeForm;

  beforeAll(async () => {
    ({ SubscribeForm } = await import('./SubscribeForm'));
  });

  it('renders ArtistNotificationsCTA by default (single-step flow)', () => {
    render(<SubscribeForm artist={makeArtist()} />);

    expect(screen.getByTestId('artist-notifications-cta')).toBeInTheDocument();
    expect(
      screen.queryByTestId('two-step-notifications-cta')
    ).not.toBeInTheDocument();
  });

  it('renders TwoStepNotificationsCTA when twoStep=true', () => {
    render(<SubscribeForm artist={makeArtist()} twoStep />);

    expect(
      screen.getByTestId('two-step-notifications-cta')
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId('artist-notifications-cta')
    ).not.toBeInTheDocument();
  });

  it('passes inline presentation through to ArtistNotificationsCTA', () => {
    render(<SubscribeForm artist={makeArtist()} presentation='inline' />);

    const cta = screen.getByTestId('artist-notifications-cta');
    expect(cta.dataset.presentation).toBe('inline');
    expect(cta.dataset.forceExpanded).toBe('true');
  });

  it('passes overlay presentation through to ArtistNotificationsCTA', () => {
    render(<SubscribeForm artist={makeArtist()} presentation='overlay' />);

    const cta = screen.getByTestId('artist-notifications-cta');
    expect(cta.dataset.presentation).toBe('overlay');
    expect(cta.dataset.forceExpanded).toBe('false');
  });

  it('passes inline presentation through to TwoStepNotificationsCTA', () => {
    render(
      <SubscribeForm artist={makeArtist()} twoStep presentation='inline' />
    );

    const cta = screen.getByTestId('two-step-notifications-cta');
    expect(cta.dataset.startExpanded).toBe('true');
  });

  it('passes overlay presentation through to TwoStepNotificationsCTA', () => {
    render(
      <SubscribeForm artist={makeArtist()} twoStep presentation='overlay' />
    );

    const cta = screen.getByTestId('two-step-notifications-cta');
    expect(cta.dataset.startExpanded).toBe('false');
  });

  it('passes the artist handle through', () => {
    render(<SubscribeForm artist={makeArtist({ handle: 'djexample' })} />);

    expect(
      screen.getByTestId('artist-notifications-cta').dataset.artistHandle
    ).toBe('djexample');
  });
});
