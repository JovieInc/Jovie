import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ProfilesRouteSkeleton } from './ProfilesRouteSkeleton';

const meta = {
  title: 'App/Profiles/Route Skeleton',
  component: ProfilesRouteSkeleton,
  parameters: { layout: 'fullscreen' },
  render: () => (
    <div className='relative flex h-160 w-full overflow-hidden bg-base'>
      <ProfilesRouteSkeleton />
    </div>
  ),
} satisfies Meta<typeof ProfilesRouteSkeleton>;

export default meta;
type Story = StoryObj<typeof meta>;

/** First-boot fallback for /app/profiles and /app/presence. */
export const LoadingProfiles: Story = {};

/** On a phone the rank, change and monitoring columns stay hidden. */
export const LoadingNarrow: Story = {
  parameters: { viewport: { defaultViewport: 'mobile1' } },
};

/** In a right-to-left document the toolbar and the table mirror. */
export const RtlMirrored: Story = {
  render: () => (
    <div
      dir='rtl'
      lang='ar'
      className='relative flex h-160 w-full overflow-hidden bg-base'
    >
      <ProfilesRouteSkeleton />
    </div>
  ),
};
