import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PROFILE_STORY_ARTIST } from './profile-story-fixture';
import { StaticArtistPage } from './StaticArtistPage';

vi.mock('@/features/profile/templates/ProfileCompactTemplate', () => ({
  ProfileCompactTemplate: ({
    catalogLoadFailed,
    proofClaim,
    claimFooterHref,
    claimFooterLabel,
  }: {
    readonly catalogLoadFailed?: boolean;
    readonly proofClaim?: boolean;
    readonly claimFooterHref?: string | null;
    readonly claimFooterLabel?: string;
  }) => (
    <div
      data-testid='mock-compact-template'
      data-catalog-load-failed={catalogLoadFailed ? 'true' : 'false'}
      data-proof-claim={proofClaim ? 'true' : 'false'}
      data-claim-footer-href={claimFooterHref ?? ''}
      data-claim-footer-label={claimFooterLabel ?? ''}
    />
  ),
}));

describe('StaticArtistPage', () => {
  it('forwards catalog load failure instead of an empty catalog', () => {
    render(
      <StaticArtistPage
        mode='listen'
        artist={PROFILE_STORY_ARTIST}
        socialLinks={[]}
        contacts={[]}
        subtitle='Artist profile'
        showBackButton={false}
        catalogLoadFailed
        releases={[]}
      />
    );
    expect(screen.getByTestId('mock-compact-template')).toHaveAttribute(
      'data-catalog-load-failed',
      'true'
    );
  });

  it('forwards the proof-to-claim footer onto the compact template', () => {
    render(
      <StaticArtistPage
        mode='profile'
        artist={PROFILE_STORY_ARTIST}
        socialLinks={[]}
        contacts={[]}
        subtitle='Artist profile'
        showBackButton={false}
        showClaimFooter
        claimFooterHref='/waitlist?campaign=proof-to-claim'
        claimFooterLabel='Request access'
        proofClaim
      />
    );
    const template = screen.getByTestId('mock-compact-template');
    expect(template).toHaveAttribute('data-proof-claim', 'true');
    expect(template).toHaveAttribute(
      'data-claim-footer-href',
      '/waitlist?campaign=proof-to-claim'
    );
    expect(template).toHaveAttribute(
      'data-claim-footer-label',
      'Request access'
    );
  });
});
