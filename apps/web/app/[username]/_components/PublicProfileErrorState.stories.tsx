import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { PublicProfileErrorState } from './PublicProfileErrorState';

const meta = {
  title: 'Profile/PublicProfileErrorState',
  component: PublicProfileErrorState,
  parameters: { layout: 'fullscreen' },
  args: { retryHref: '/tim' },
} satisfies Meta<typeof PublicProfileErrorState>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The transient profile read failure: the alert with Try Again and Go Home. */
export const ErrorTransientRead: Story = {};

/** The same alert at phone width, where the two actions stack. */
export const ErrorPhoneWidth: Story = {
  decorators: [
    Story => (
      <div className='w-80'>
        <Story />
      </div>
    ),
  ],
};

/** Icon, copy and actions mirror inside a right-to-left page. */
export const Rtl: Story = {
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
};
