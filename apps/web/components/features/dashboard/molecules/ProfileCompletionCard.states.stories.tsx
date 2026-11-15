import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { DashboardData } from '@/app/app/(shell)/dashboard/actions/dashboard-data';
import { DashboardDataProvider } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { APP_ROUTES } from '@/constants/routes';
import { ProfileCompletionCard } from './ProfileCompletionCard';

type Completion = DashboardData['profileCompletion'];

const baseData: DashboardData = {
  user: { id: 'user_123' },
  creatorProfiles: [],
  selectedProfile: {
    id: 'profile-states',
    username: 'midnightsignal',
    displayName: 'Midnight Signal',
  } as DashboardData['selectedProfile'],
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
    percentage: 0,
    completedCount: 0,
    totalCount: 0,
    steps: [],
    profileIsLive: false,
  },
};

function withCompletion(profileCompletion: Completion): DashboardData {
  return { ...baseData, profileCompletion };
}

type CardMeta = Meta<typeof ProfileCompletionCard>;

/** Supplies each story's completion data through the dashboard provider. */
const CompletionDataDecorator: NonNullable<CardMeta['decorators']> =
  function CompletionDataDecorator(Story, context) {
    const data =
      (context.parameters.dashboardData as DashboardData) ?? baseData;
    const rtl = context.parameters.rtl === true;
    return (
      <div
        dir={rtl ? 'rtl' : undefined}
        lang={rtl ? 'ar' : undefined}
        className='max-w-3xl p-6'
      >
        <DashboardDataProvider value={data}>
          <Story />
        </DashboardDataProvider>
      </div>
    );
  };

/**
 * Rendered states of the profile completion card. The default card lives in
 * ProfileCompletionCard.stories.tsx.
 */
const meta = {
  title: 'Dashboard/Molecules/ProfileCompletionCard/States',
  component: ProfileCompletionCard,
  decorators: [CompletionDataDecorator],
} satisfies CardMeta;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: no remaining steps, so the card renders nothing. */
export const EmptyNoSteps: Story = {
  parameters: {
    dashboardData: withCompletion({
      percentage: 40,
      completedCount: 2,
      totalCount: 5,
      steps: [],
      profileIsLive: true,
    }),
  },
};

/** Partial: a profile that is not live yet, with one essential left and no dismiss. */
export const PartialNotLiveYet: Story = {
  parameters: {
    dashboardData: withCompletion({
      percentage: 20,
      completedCount: 1,
      totalCount: 5,
      steps: [
        {
          id: 'handle',
          label: 'Claim your handle',
          description: 'Your jov.ie handle is how fans find you.',
          href: APP_ROUTES.SETTINGS_PROFILE,
        },
      ],
      profileIsLive: false,
    }),
  },
};

/** Long content: long step labels and descriptions; only the first three show. */
export const LongContentSteps: Story = {
  parameters: {
    dashboardData: withCompletion({
      percentage: 57,
      completedCount: 4,
      totalCount: 8,
      steps: (['name', 'avatar', 'handle', 'music-links'] as const).map(
        (id, n) => ({
          id,
          label: `Connect every streaming service and social account you use, step ${n + 1}`,
          description:
            'A long description that runs past the width of the card so it has to truncate on a single line rather than wrap.',
          href: APP_ROUTES.SETTINGS_PROFILE,
        })
      ),
      profileIsLive: true,
    }),
  },
};

/** Right-to-left: Arabic step copy in an RTL document. */
export const RtlArabicSteps: Story = {
  parameters: {
    rtl: true,
    dashboardData: withCompletion({
      percentage: 57,
      completedCount: 4,
      totalCount: 6,
      steps: [
        {
          id: 'avatar',
          label: 'أضف صورة للملف الشخصي',
          description: 'الصورة الواضحة تجعل صفحتك أقرب للمعجبين.',
          href: APP_ROUTES.SETTINGS_PROFILE,
        },
      ],
      profileIsLive: true,
    }),
  },
};
