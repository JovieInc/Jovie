import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { PreviewPanelData } from '@/app/app/(shell)/dashboard/PreviewPanelContext';
import { APP_ROUTES } from '@/constants/routes';
import { ProfileBentoView } from './ProfileContactSidebarSections';

vi.mock('./ProfileSmartLinkAnalytics', () => ({
  ProfileSmartLinkAnalytics: () => null,
}));
const flags = vi.hoisted(() => ({ identity: true }));
vi.mock('@/lib/flags/client', () => ({ useAppFlag: () => flags.identity }));

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

  it('routes the current Identity label to its canonical destination', () => {
    flags.identity = true;
    render(
      <ProfileBentoView
        previewData={previewData}
        profileUrl='https://jov.ie/alex'
      />
    );

    expect(
      screen.getByRole('link', { name: 'Manage In Identity' })
    ).toHaveAttribute('href', APP_ROUTES.PRESENCE);
  });

  it('passes the projected destination to the host callback', async () => {
    flags.identity = true;
    const onManageConnections = vi.fn();
    render(
      <ProfileBentoView
        previewData={previewData}
        profileUrl='https://jov.ie/alex'
        onManageConnections={onManageConnections}
      />
    );

    const button = screen.getByRole('button', { name: 'Manage In Identity' });
    button.click();
    expect(onManageConnections).toHaveBeenCalledExactlyOnceWith(
      APP_ROUTES.PRESENCE
    );
  });
  it('shows the settings fallback without claiming the disabled workspace', () => {
    flags.identity = false;
    render(
      <ProfileBentoView
        previewData={previewData}
        profileUrl='https://jov.ie/alex'
      />
    );
    expect(
      screen.getByRole('link', { name: 'Manage Profile' })
    ).toHaveAttribute('href', `${APP_ROUTES.SETTINGS_PROFILE}?tab=music`);
    expect(screen.queryByText('Manage In Identity')).not.toBeInTheDocument();
  });
});
