import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ProfileClaimFooter } from './ProfileClaimFooter';

const meta = {
  title: 'Profile/ProfileClaimFooter',
  component: ProfileClaimFooter,
  parameters: { layout: 'centered' },
  args: {
    href: '/waitlist?campaign=proof-to-claim',
    label: 'Request access',
    proofClaim: true,
    enabled: true,
  },
} satisfies Meta<typeof ProfileClaimFooter>;

export default meta;

export const RequestAccess: StoryObj<typeof ProfileClaimFooter> = {
  render: args => (
    <div className='min-h-24 w-full bg-base p-8 text-primary-token'>
      <ProfileClaimFooter {...args} className='flex' />
    </div>
  ),
};
