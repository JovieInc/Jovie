import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ReleaseViewModel } from '@/lib/discography/types';
import { SmartLinkCell } from './SmartLinkCell';

vi.mock('@/components/feedback', () => ({
  toast: { success: vi.fn() },
}));

const baseRelease: ReleaseViewModel = {
  profileId: 'profile-1',
  id: 'release-1',
  title: 'Skyline Dreams',
  slug: 'skyline-dreams',
  status: 'released',
  releaseType: 'single',
  isExplicit: false,
  releaseDate: '2026-06-15',
  totalTracks: 1,
  providers: [],
  smartLinkPath: '/smart/release-1',
};

describe('SmartLinkCell', () => {
  it('names the canonical Artist Presence plan on the locked upsell', () => {
    render(<SmartLinkCell release={baseRelease} locked />);

    expect(screen.getByTestId('smart-link-locked-release-1')).toHaveAttribute(
      'title',
      'Upgrade to Artist Presence to unlock this smart link'
    );
  });

  it('names the canonical Artist Presence plan on the scheduled upsell', () => {
    render(
      <SmartLinkCell
        release={{ ...baseRelease, status: 'scheduled' }}
        locked
        lockReason='scheduled'
      />
    );

    expect(screen.getByTestId('smart-link-locked-release-1')).toHaveAttribute(
      'title',
      'Smart link goes live on release day. Upgrade to Artist Presence for pre-release pages.'
    );
  });
});
