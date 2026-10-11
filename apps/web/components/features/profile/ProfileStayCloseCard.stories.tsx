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
