import { render, screen } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProfileSocialLink } from '@/app/app/(shell)/dashboard/actions/social-links';
import type { AvailableDSP } from '@/lib/dsp';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { PreviewDataHydrator } from './PreviewDataHydrator';

const register = vi.hoisted(() => vi.fn());
const breadcrumb = vi.hoisted(() => vi.fn());
const hydration = vi.hoisted(() => ({
  setPreviewData: vi.fn(),
  previewData: null as { username: string } | null,
  selectedProfile: {
    username: 'Sasha',
    usernameNormalized: 'sasha',
    displayName: 'Sasha Waves',
    isVerified: false,
    spotifyId: 'sp-1',
    settings: {},
  } as Record<string, unknown> | null,
}));

vi.mock('@sentry/nextjs', () => ({ addBreadcrumb: breadcrumb }));
vi.mock('@/app/app/(shell)/dashboard/DashboardDataContext', () => ({
  useDashboardData: () => ({ selectedProfile: hydration.selectedProfile }),
}));
vi.mock('@/app/app/(shell)/dashboard/PreviewPanelContext', () => ({
  usePreviewPanelData: () => ({
    previewData: hydration.previewData,
    setPreviewData: hydration.setPreviewData,
  }),
}));
vi.mock('@/hooks/useRegisterRightPanel', () => ({
  useRegisterRightPanel: register,
}));
vi.mock('@/components/providers/ErrorBoundary', () => ({
  ErrorBoundary: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('@/features/dashboard/organisms/profile-contact-sidebar', () => ({
  ProfileContactSidebar: () => <aside aria-label='Artist profile' />,
}));

function link(
  id: string,
  overrides: Partial<ProfileSocialLink> = {}
): ProfileSocialLink {
  return {
    id,
    platform: 'instagram',
    platformType: 'social',
    url: `https://instagram.com/${id}`,
    sortOrder: 0,
    isActive: true,
    displayText: null,
    state: 'active',
    ...overrides,
  };
}

function lastHydration() {
  const update = hydration.setPreviewData.mock.calls.at(-1)?.[0];
  return update(null);
}

beforeEach(() => {
  hydration.setPreviewData.mockClear();
  register.mockClear();
  breadcrumb.mockClear();
});

describe('PreviewDataHydrator certificate', () => {
  it('renders nothing itself and registers an accessible profile rail', async () => {
    const { container } = render(
      <PreviewDataHydrator initialLinks={[]} connectedDSPs={[]} />
    );
    expect(container).toBeEmptyDOMElement();
    await expectNoA11yViolations(container);

    const rail = render(register.mock.calls.at(-1)?.[0] as ReactElement);
    expect(
      screen.getByRole('complementary', { name: 'Artist profile' })
    ).toBeInTheDocument();
    await expectNoA11yViolations(rail.container);
  });

  it('hydrates an empty link list when every link is pending review', () => {
    render(
      <PreviewDataHydrator
        initialLinks={[
          link('a', { state: 'suggested' }),
          link('b', { state: 'rejected' }),
        ]}
        connectedDSPs={[]}
      />
    );

    expect(lastHydration()).toMatchObject({
      username: 'sasha',
      profilePath: '/sasha',
      links: [],
    });
  });

  it('maps visible links, DSP connections and unknown platform types', () => {
    render(
      <PreviewDataHydrator
        initialLinks={[
          link('ig', { displayText: 'Instagram', isActive: false }),
          link('odd', { platformType: 'mystery' }),
        ]}
        connectedDSPs={[{ key: 'spotify' }] as unknown as AvailableDSP[]}
      />
    );

    const data = lastHydration();
    expect(data.links).toEqual([
      expect.objectContaining({ id: 'ig', title: 'Instagram', isVisible: false }),
      expect.objectContaining({ id: 'odd', platformType: undefined }),
    ]);
    expect(data.dspConnections.spotify).toEqual({
      connected: true,
      artistName: 'Sasha Waves',
    });
    expect(data.dspConnections.appleMusic.connected).toBe(false);
    expect(breadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'links', level: 'warning' })
    );
  });

  it('waits for a selected profile before hydrating', () => {
    const profile = hydration.selectedProfile;
    hydration.selectedProfile = null;
    render(<PreviewDataHydrator initialLinks={[]} connectedDSPs={[]} />);
    expect(hydration.setPreviewData).not.toHaveBeenCalled();
    hydration.selectedProfile = profile;
  });
});
