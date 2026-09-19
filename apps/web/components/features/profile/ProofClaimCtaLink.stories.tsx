import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ProofClaimCtaLink } from './ProofClaimCtaLink';

const meta = {
  title: 'Profile/ProofClaimCtaLink',
  component: ProofClaimCtaLink,
  parameters: { layout: 'centered' },
  args: {
    href: '/waitlist?campaign=proof-to-claim',
    label: 'Request access',
    ariaLabel: 'Request access — get your Jovie from the Tim White profile',
  },
} satisfies Meta<typeof ProofClaimCtaLink>;

export default meta;

export const RequestAccess: StoryObj<typeof ProofClaimCtaLink> = {
  render: args => (
    <div className='bg-base p-8 text-primary-token'>
      <ProofClaimCtaLink
        {...args}
        className='profile-aeo-claim-card__cta inline-flex min-h-12 items-center justify-center rounded-full px-6 text-sm font-semibold'
      />
    </div>
  ),
};
