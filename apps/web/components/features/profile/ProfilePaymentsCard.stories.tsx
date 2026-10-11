import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { resolveProfileModeCardAccents } from '@/lib/profile/mode-card-accent';
import { ProfilePaymentsCard } from './ProfilePaymentsCard';

const meta = {
  title: 'Profile/ProfilePaymentsCard',
  component: ProfilePaymentsCard,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div className='w-sm max-w-full bg-base p-4'>
        <Story />
      </div>
    ),
  ],
  args: {
    artistName: 'Tim White',
    venmoLink: 'https://venmo.com/u/timwhite',
    accent: resolveProfileModeCardAccents({ listenArtworkAccent: 'ultra' })
      .payments,
    amounts: [5, 10, 20],
    defaultAmount: 10,
    renderMode: 'interactive',
  },
} satisfies Meta<typeof ProfilePaymentsCard>;

export default meta;
export const Default: StoryObj<typeof meta> = {};
