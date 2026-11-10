import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { resolveProfileModeCardAccents } from '@/lib/profile/mode-card-accent';
import { ProfileModeCardAction } from './ProfileModeCard';
import { ProfileStayCloseCard } from './ProfileStayCloseCard';

const meta = {
  title: 'Profile/ProfileStayCloseCard',
  component: ProfileStayCloseCard,
  parameters: { layout: 'centered' },
  decorators: [
    Story => (
      <div className='w-sm max-w-full bg-base p-4'>
        <Story />
      </div>
    ),
  ],
  args: {
    accent: resolveProfileModeCardAccents({ listenArtworkAccent: 'ultra' })[
      'stay-close'
    ],
    children: (
      <ProfileModeCardAction href='/tim/alerts'>
        Get alerts
      </ProfileModeCardAction>
    ),
  },
} satisfies Meta<typeof ProfileStayCloseCard>;

export default meta;
export const Default: StoryObj<typeof meta> = {};

const flowCopyClassName = 'text-mid text-(--profile-mode-card-muted)';

/** A long artist name and consent copy in the alerts flow. */
export const LongContentConsentCopy: StoryObj<typeof meta> = {
  args: {
    children: (
      <div className='space-y-2'>
        <p className={flowCopyClassName}>
          Get a text or email when Maximilian Alexander
          Featherstonehaugh-Wolfeschlegelsteinhausen and the Midnight Static
          Orchestra release new music, announce tour dates in your city or open
          presale tickets. Message frequency varies. Reply STOP to unsubscribe
          at any time.
        </p>
        <ProfileModeCardAction href='/tim/alerts'>
          Get alerts
        </ProfileModeCardAction>
      </div>
    ),
  },
};

/** Hebrew alerts copy in a right-to-left profile. */
export const RtlHebrew: StoryObj<typeof meta> = {
  args: {
    children: (
      <div className='space-y-2'>
        <p className={flowCopyClassName}>
          קבלו הודעה כשיוצא שיר חדש או כשנקבעת הופעה בעיר שלכם.
        </p>
        <ProfileModeCardAction href='/tim/alerts'>
          קבלו התראות
        </ProfileModeCardAction>
      </div>
    ),
  },
  render: args => (
    <div dir='rtl' lang='he'>
      <ProfileStayCloseCard {...args} />
    </div>
  ),
};
