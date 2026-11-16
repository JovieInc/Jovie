import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import {
  ProofClaimCtaLink,
  proofClaimFooterClassName,
} from './ProofClaimCtaLink';

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

/** The profile footer look on the dark stage, with no aria-label override:
 *  the accessible name falls back to the visible label. */
export const PartialFooterNoAriaLabel: StoryObj<typeof ProofClaimCtaLink> = {
  args: { ariaLabel: undefined, label: 'Claim yours' },
  render: args => (
    <div className='dark bg-base p-8'>
      <ProofClaimCtaLink {...args} className={proofClaimFooterClassName()} />
    </div>
  ),
};

/** A long label wraps inside a narrow column instead of overflowing it. */
export const LongContentLabel: StoryObj<typeof ProofClaimCtaLink> = {
  args: {
    ariaLabel: undefined,
    label:
      'Request early access to your own Jovie profile for every release, tour date and fan update',
  },
  render: args => (
    <div className='dark w-64 bg-base p-8'>
      <ProofClaimCtaLink {...args} className={proofClaimFooterClassName()} />
    </div>
  ),
};

/** The footer link inside a right-to-left page. */
export const Rtl: StoryObj<typeof ProofClaimCtaLink> = {
  args: { ariaLabel: undefined, label: 'اطلب الوصول' },
  render: args => (
    <div dir='rtl' lang='ar' className='dark bg-base p-8'>
      <ProofClaimCtaLink {...args} className={proofClaimFooterClassName()} />
    </div>
  ),
};
