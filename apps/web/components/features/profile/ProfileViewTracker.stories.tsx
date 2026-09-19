import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ProfileViewTracker } from './ProfileViewTracker';

const meta = {
  title: 'Profile/ProfileViewTracker',
  component: ProfileViewTracker,
  parameters: { layout: 'centered' },
  args: {
    handle: 'tim',
    artistId: 'artist-tim',
  },
} satisfies Meta<typeof ProfileViewTracker>;

export default meta;

export const ProofProfile: StoryObj<typeof ProfileViewTracker> = {
  render: args => (
    <div className='min-h-40 bg-base p-8 text-primary-token'>
      <p className='text-sm'>
        View tracker mounts with no visible chrome. Proof profile handle{' '}
        <span className='font-medium'>{args.handle}</span> records proof_viewed.
      </p>
      <ProfileViewTracker {...args} />
    </div>
  ),
};
