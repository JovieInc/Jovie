import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { PreviewPanelData } from '@/app/app/(shell)/dashboard/PreviewPanelContext';
import { APP_ROUTES } from '@/constants/routes';
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
  activeSinceYear: null,
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

  it('routes Manage In Presence to the Presence surface', () => {
    render(
      <ProfileBentoView
        previewData={previewData}
        profileUrl='https://jov.ie/alex'
      />
    );

    expect(
      screen.getByRole('link', { name: 'Manage In Presence' })
    ).toHaveAttribute('href', APP_ROUTES.PRESENCE);
  });

  it('keeps Manage In Presence as a callback when the host overrides it', async () => {
    const onManageConnections = vi.fn();
    render(
      <ProfileBentoView
        previewData={previewData}
        profileUrl='https://jov.ie/alex'
        onManageConnections={onManageConnections}
      />
    );

    const button = screen.getByRole('button', { name: 'Manage In Presence' });
    button.click();
    expect(onManageConnections).toHaveBeenCalledTimes(1);
  });
});
