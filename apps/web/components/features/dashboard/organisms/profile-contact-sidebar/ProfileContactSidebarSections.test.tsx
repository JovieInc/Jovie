import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { PreviewPanelData } from '@/app/app/(shell)/dashboard/PreviewPanelContext';
import { ProfileBentoView } from './ProfileContactSidebarSections';

vi.mock('./ProfileSmartLinkAnalytics', () => ({
  ProfileSmartLinkAnalytics: () => null,
}));

const previewData: PreviewPanelData = {
  username: 'alex',
  displayName: 'Alex Rivera',
  avatarUrl: null,
  bio: 'Independent artist',
  genres: null,
  location: null,
  hometown: null,
  links: [],
  profilePath: '/alex',
  dspConnections: {
    spotify: { connected: false, artistName: null },
    appleMusic: { connected: false, artistName: null },
  },
};

describe('ProfileBentoView', () => {
  it('renders the canonical EntityHeader with profile identity', () => {
    render(
      <ProfileBentoView
        previewData={previewData}
        profileUrl='https://jov.ie/alex'
      />
    );

    const header = screen.getByTestId('profile-preview-entity-header');
    expect(header).toHaveAttribute('data-layout', 'inline');
    expect(header).toHaveTextContent('Alex Rivera');
    expect(header).toHaveTextContent('@alex');
  });
});
