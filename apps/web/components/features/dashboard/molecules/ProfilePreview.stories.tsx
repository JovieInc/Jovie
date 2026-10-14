import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ProfilePreview } from './ProfilePreview';

const meta = {
  title: 'Dashboard/Molecules/ProfilePreview',
  component: ProfilePreview,
  parameters: { layout: 'centered' },
  decorators: [
    Story => (
      <div className='h-[600px] w-80'>
        <Story />
      </div>
    ),
  ],
  args: { username: 'sashawaves', displayName: 'Sasha Waves', links: [] },
} satisfies Meta<typeof ProfilePreview>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Unverified: Story = {};
export const VerifiedFallback: Story = { args: { isVerified: true } };
export const VerifiedPortrait: Story = {
  args: { isVerified: true, avatarUrl: '/avatars/default-user.png' },
};
