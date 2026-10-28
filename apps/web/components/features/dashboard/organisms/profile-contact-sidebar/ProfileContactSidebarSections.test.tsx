import { fireEvent, render, screen } from '@testing-library/react';
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

  it('routes the current Identity label to its canonical destination', () => {
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
  it('always hands off to Identity without a rollout provider', () => {
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
});

it('carries source verification into the profile rail through image failure without treating DSP connection as verification', () => {
  const props = {
    previewData: {
      ...previewData,
      isVerified: true,
      avatarUrl: 'https://example.com/missing.jpg',
    },
    profileUrl: 'https://jov.ie/alex',
  };
  const { container, rerender } = render(<ProfileBentoView {...props} />);
  fireEvent.error(container.querySelector('img')!);
  expect(
    screen.getByRole('img', { name: 'Verified Jovie Profile' })
  ).toBeInTheDocument();
  expect(
    screen
      .getByTestId('profile-preview-entity-header')
      .querySelector('[data-entity-header-thumbnail-variant]')
  ).toHaveAttribute('data-entity-header-thumbnail-variant', 'person');
  rerender(
    <ProfileBentoView
      {...props}
      previewData={{
        ...props.previewData,
        isVerified: false,
        dspConnections: {
          ...previewData.dspConnections,
          spotify: { connected: true, artistName: 'Alex Rivera' },
        },
      }}
    />
  );
  expect(
    screen.queryByRole('img', { name: 'Verified Jovie Profile' })
  ).toBeNull();
});
