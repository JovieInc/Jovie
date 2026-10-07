import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProfileSocialLink } from '@/app/app/(shell)/dashboard/actions/social-links';
import type { PreviewPanelData } from '@/app/app/(shell)/dashboard/PreviewPanelContext';
import { PreviewDataHydrator } from './PreviewDataHydrator';

const mockState = vi.hoisted(() => ({
  registerRightPanel: vi.fn(),
  setPreviewData: vi.fn(),
  addBreadcrumb: vi.fn(),
  selectedProfile: {
    id: 'profile-1',
    username: 'Artist',
    usernameNormalized: 'artist',
    displayName: 'Artist',
    avatarUrl: null,
    bio: 'Bio',
    genres: null,
    location: null,
    settings: {},
    activeSinceYear: 2020,
    profileEditVersion: 1,
    spotifyId: 'sp-1',
    appleMusicId: null,
  } as Record<string, unknown> | null,
}));

vi.mock('@sentry/nextjs', () => ({
  addBreadcrumb: mockState.addBreadcrumb,
}));

vi.mock('@/app/app/(shell)/dashboard/PreviewPanelContext', () => ({
  usePreviewPanelData: () => ({ setPreviewData: mockState.setPreviewData }),
}));

vi.mock('@/app/app/(shell)/dashboard/DashboardDataContext', () => ({
  useDashboardData: () => ({ selectedProfile: mockState.selectedProfile }),
}));

vi.mock('@/hooks/useRegisterRightPanel', () => ({
  useRegisterRightPanel: (panel: ReactNode) =>
    mockState.registerRightPanel(panel),
}));

vi.mock('@/features/dashboard/organisms/profile-contact-sidebar', () => ({
  ProfileContactSidebar: () => (
    <div data-testid='profile-contact-sidebar' />
  ),
}));

function renderHydrator(initialLinks: ProfileSocialLink[] = []) {
  return render(
    <PreviewDataHydrator initialLinks={initialLinks} connectedDSPs={[]} />
  );
}

describe('PreviewDataHydrator', () => {
  beforeEach(() => {
    mockState.registerRightPanel.mockReset();
    mockState.setPreviewData.mockReset();
    mockState.addBreadcrumb.mockReset();
    mockState.selectedProfile = {
      id: 'profile-1',
      username: 'Artist',
      usernameNormalized: 'artist',
      displayName: 'Artist',
      avatarUrl: null,
      bio: 'Bio',
      genres: null,
      location: null,
      settings: {},
      activeSinceYear: 2020,
      profileEditVersion: 1,
      spotifyId: 'sp-1',
      appleMusicId: null,
    };
  });

  it('registers the profile rail inside a shell-only preview wrapper', () => {
    renderHydrator();

    expect(mockState.registerRightPanel).toHaveBeenCalledTimes(1);
    const panel = mockState.registerRightPanel.mock.calls[0][0] as ReactNode;
    const { container } = render(<>{panel}</>);

    const wrapper = container.querySelector('[data-shell-profile-only]');
    expect(wrapper).not.toBeNull();
    expect(wrapper?.className).toContain('contents');
    expect(
      screen.getByTestId('profile-contact-sidebar')
    ).toBeInTheDocument();
  });

  it('hydrates preview data through a functional merge update', () => {
    renderHydrator([
      {
        id: 'link-1',
        platform: 'instagram',
        platformType: 'social',
        url: 'https://instagram.com/artist',
        isActive: true,
        displayText: null,
        state: 'active',
      } as ProfileSocialLink,
    ]);

    expect(mockState.setPreviewData).toHaveBeenCalled();
    const updater = mockState.setPreviewData.mock.calls.at(-1)?.[0] as (
      current: PreviewPanelData | null
    ) => PreviewPanelData;
    const merged = updater(null);
    expect(merged.username).toBe('artist');
    expect(merged.links).toHaveLength(1);
    expect(merged.dspConnections.spotify.connected).toBe(false);
    expect(merged.dspConnections.spotify.artistName).toBe('Artist');
  });

  it('sanitizes unknown link platform types instead of passing them through', () => {
    renderHydrator([
      {
        id: 'link-x',
        platform: 'mystery',
        platformType: 'mystery',
        url: 'https://x.example',
        isActive: true,
        displayText: null,
        state: 'active',
      } as ProfileSocialLink,
    ]);

    const updater = mockState.setPreviewData.mock.calls.at(-1)?.[0] as (
      current: PreviewPanelData | null
    ) => PreviewPanelData;
    const merged = updater(null);
    expect(merged.links[0]?.platformType).toBeUndefined();
    expect(mockState.addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'links' })
    );
  });

  it('skips hydration until a profile is selected', () => {
    mockState.selectedProfile = null;
    renderHydrator();

    expect(mockState.setPreviewData).not.toHaveBeenCalled();
  });
});
