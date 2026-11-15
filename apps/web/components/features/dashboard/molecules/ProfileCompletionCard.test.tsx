import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DashboardData } from '@/app/app/(shell)/dashboard/actions/dashboard-data';
import { DashboardDataProvider } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ProfileCompletionCard } from './ProfileCompletionCard';

vi.mock('@/lib/error-tracking', () => ({ captureWarning: vi.fn() }));

const steps = [
  {
    id: 'avatar',
    label: 'Add a profile photo',
    description: 'A recognizable photo makes your page feel personal.',
    href: '/app/settings/profile',
  },
  {
    id: 'music',
    label: 'Connect your music links',
    description: 'Link Spotify or Apple Music so fans can listen.',
    href: '/app/settings/profile',
  },
  {
    id: 'handle',
    label: 'Claim your handle',
    description: 'Your handle is how fans find you.',
    href: '/app/settings/profile',
  },
  {
    id: 'bio',
    label: 'Write a bio',
    description: 'Tell fans who you are.',
    href: '/app/settings/profile',
  },
];

function data(
  completion: Partial<DashboardData['profileCompletion']>,
  profileId: string | null = 'profile-1'
): DashboardData {
  return {
    user: { id: 'user_123' },
    creatorProfiles: [],
    selectedProfile: profileId
      ? ({
          id: profileId,
          username: 'midnight',
        } as DashboardData['selectedProfile'])
      : null,
    needsOnboarding: false,
    sidebarCollapsed: false,
    hasSocialLinks: false,
    hasMusicLinks: false,
    isAdmin: false,
    tippingStats: {
      tipClicks: 0,
      qrTipClicks: 0,
      linkTipClicks: 0,
      tipsSubmitted: 0,
      totalReceivedCents: 0,
      monthReceivedCents: 0,
    },
    profileCompletion: {
      percentage: 57,
      completedCount: 4,
      totalCount: 8,
      steps,
      profileIsLive: true,
      ...completion,
    },
  } as DashboardData;
}

function renderCard(value: DashboardData) {
  return render(
    <DashboardDataProvider value={value}>
      <ProfileCompletionCard />
    </DashboardDataProvider>
  );
}

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('ProfileCompletionCard', () => {
  it('shows a live profile with three steps and its progress', async () => {
    const { container } = renderCard(data({}));
    expect(
      await screen.findByText('Your profile is 57% complete')
    ).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute(
      'aria-valuenow',
      '57'
    );
    expect(screen.getAllByRole('link')).toHaveLength(3);
    expect(screen.queryByText('Write a bio')).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('dismisses a live profile and remembers it for this percentage', async () => {
    const user = userEvent.setup();
    const { container } = renderCard(data({}));
    await user.click(
      await screen.findByRole('button', {
        name: 'Dismiss Profile Completion Card',
      })
    );
    expect(screen.queryByText('Your profile is 57% complete')).toBeNull();
    expect(container).toBeEmptyDOMElement();
    expect(
      localStorage.getItem('jovie_profile_completion_dismissed:profile-1:57')
    ).toBe('1');
  });

  it('stays hidden when it was dismissed before', async () => {
    localStorage.setItem(
      'jovie_profile_completion_dismissed:profile-1:57',
      '1'
    );
    const { container } = renderCard(data({}));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(container).toBeEmptyDOMElement();
  });

  it('cannot be dismissed while the profile is not live', async () => {
    const { container } = renderCard(data({ profileIsLive: false }));
    expect(
      await screen.findByText('Your profile is not live yet')
    ).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('renders nothing with no steps, a complete profile or no profile', () => {
    const empty = renderCard(data({ steps: [] }));
    expect(empty.container).toBeEmptyDOMElement();
    empty.unmount();
    const complete = renderCard(data({ percentage: 100 }));
    expect(complete.container).toBeEmptyDOMElement();
    complete.unmount();
    const none = renderCard(data({}, null));
    expect(none.container).toBeEmptyDOMElement();
  });

  it('still shows the card when localStorage cannot be read', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    renderCard(data({}));
    expect(
      await screen.findByText('Your profile is 57% complete')
    ).toBeInTheDocument();
  });

  it('renders Arabic step copy right to left', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <DashboardDataProvider
          value={data({
            steps: [{ ...steps[0], label: 'أضف صورة للملف الشخصي' }],
          })}
        >
          <ProfileCompletionCard />
        </DashboardDataProvider>
      </div>
    );
    expect(
      await screen.findByText('أضف صورة للملف الشخصي')
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
