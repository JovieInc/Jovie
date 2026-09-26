import { describe, expect, it } from 'vitest';
import {
  type ArtistStatusFacts,
  canViewListing,
  presentArtistStatus,
  presentUnmanagedListing,
} from './artist-status-presentation';

/**
 * Expected values are authored directly from the approved copy contract
 * (JOV-6553, Tim 2026-09-23), NOT from the mapper implementation. Changing
 * the mapping back to `record exists => On Jovie`, `!isClaimed => Available`,
 * or `isClaimed => Artist-managed` must fail these checks.
 */

const baseFacts: ArtistStatusFacts = {
  availability: 'unknown',
  management: 'none',
  publication: 'published',
  reservation: 'none',
};

describe('presentArtistStatus', () => {
  it.each([
    {
      expected: {
        action: 'view_listing',
        explanation: null,
        label: 'Artist-managed',
      },
      name: 'owner-claimed published artist shows Artist-managed',
      facts: { ...baseFacts, management: 'owner_claim' },
    },
    {
      expected: {
        action: 'view_listing',
        explanation: null,
        label: 'Managed by the artist’s team',
      },
      name: 'manager-claimed published artist shows team-managed',
      facts: { ...baseFacts, management: 'manager_claim' },
    },
    {
      expected: {
        action: null,
        explanation: null,
        label: 'Jovie listing',
      },
      name: 'unpublished profile never earns a management badge (revoked/stale authorization)',
      facts: {
        ...baseFacts,
        management: 'owner_claim',
        publication: 'unpublished',
      },
    },
  ] as const satisfies ReadonlyArray<{
    readonly expected: {
      action: string | null;
      explanation: string | null;
      label: string;
    };
    readonly name: string;
    readonly facts: ArtistStatusFacts;
  }>)('$name', ({ expected, facts }) => {
    expect(presentArtistStatus(facts)).toEqual(expected);
  });

  it('a merely claimed flag with no verified ownership claim never earns Artist-managed', () => {
    const result = presentArtistStatus({
      ...baseFacts,
      management: 'claimed_flag_only',
    });

    expect(result.label).not.toBe('Artist-managed');
    expect(result.label).not.toBe('Managed by the artist’s team');
    expect(result.label).toBe('Jovie listing');
  });

  it('claimed_flag_only is truthfully identical to no evidence', () => {
    expect(
      presentArtistStatus({ ...baseFacts, management: 'claimed_flag_only' })
    ).toEqual(presentArtistStatus({ ...baseFacts, management: 'none' }));
  });

  it('enforced reservation shows Reserved for this artist with the approved explainer', () => {
    const result = presentArtistStatus({
      ...baseFacts,
      availability: 'assigned_or_blocked',
      reservation: 'enforced_reservation',
    });

    expect(result.label).toBe('Reserved for this artist');
    expect(result.action).toBe('continue_setup');
    expect(result.explanation).toContain('reserved for the artist');
    expect(result.explanation).toContain('verify that you can manage it');
  });

  it('reservation is never shown without enforcement', () => {
    const result = presentArtistStatus({
      ...baseFacts,
      availability: 'assigned_or_blocked',
      reservation: 'none',
    });

    expect(result.label).not.toContain('Reserved');
  });

  it('assigned or policy-blocked handles show Unavailable without ownership details', () => {
    const result = presentArtistStatus({
      ...baseFacts,
      availability: 'assigned_or_blocked',
    });

    expect(result.label).toBe('Unavailable');
    expect(result.action).toBeNull();
    expect(result.explanation).toBeNull();
  });

  it('available is only reported from an authoritative check', () => {
    const result = presentArtistStatus({
      ...baseFacts,
      availability: 'available',
    });

    expect(result.label).toBe('Available');
    expect(result.action).toBe('continue_setup');
  });

  it('unknown availability never shows Available or Reserved — retry is offered', () => {
    const result = presentArtistStatus({
      ...baseFacts,
      availability: 'unknown',
    });

    expect(result.label).toBe('We couldn’t check this handle. Try again.');
    expect(result.label).not.toBe('Available');
    expect(result.label).not.toContain('Reserved');
    expect(result.action).toBe('try_again');
  });

  it('unmanaged imported listing is not marked official, managed, reserved, or a customer', () => {
    const result = presentUnmanagedListing();

    expect(result.label).toBe('Jovie listing');
    expect(result.label).not.toBe('On Jovie');
    expect(result.explanation).toContain('hasn’t been verified');
    expect(result.action).toBe('view_listing');
  });

  it('confirmed Jovie-created never-authorized listing uses the stronger truthful explainer', () => {
    const result = presentUnmanagedListing({ jovieCreated: true });

    expect(result.explanation).toBe('Not managed by the artist or their team.');
  });
});

describe('canViewListing', () => {
  it('exposes view-listing action only for published records', () => {
    expect(canViewListing({ publication: 'published' })).toBe(true);
    expect(canViewListing({ publication: 'unpublished' })).toBe(false);
  });
});
