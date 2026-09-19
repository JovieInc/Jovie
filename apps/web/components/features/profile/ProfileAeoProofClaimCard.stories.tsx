import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ProfileAeoProofClaimCard } from './ProfileAeoProofClaimCard';

const meta = {
  title: 'Profile/ProfileAeoProofClaimCard',
  component: ProfileAeoProofClaimCard,
  parameters: { layout: 'fullscreen' },
  args: {
    artistName: 'Tim White',
    href: '/waitlist?campaign=proof-to-claim',
    label: 'Request access',
    note: 'Limited · Request access',
  },
} satisfies Meta<typeof ProfileAeoProofClaimCard>;

export default meta;

export const RequestAccess: StoryObj<typeof ProfileAeoProofClaimCard> = {
  render: args => (
    <div className='min-h-dvh bg-base text-primary-token'>
      <ProfileAeoProofClaimCard {...args} />
    </div>
  ),
};
