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

/** The dark profile stage it ships on, with only the required href: the
 *  default Claim Your Profile label and the plain tracked link. */
export const PartialDefaults: StoryObj<typeof ProfileClaimFooter> = {
  args: { href: '/claim', label: undefined, proofClaim: false },
  render: args => (
    <div className='dark min-h-24 w-full bg-base p-8'>
      <ProfileClaimFooter {...args} className='flex' />
    </div>
  ),
};

/** A long label stays on the centered line and wraps inside a narrow column. */
export const LongContentLabel: StoryObj<typeof ProfileClaimFooter> = {
  args: {
    label:
      'Request early access to your own Jovie profile for every release and tour date',
  },
  render: args => (
    <div className='dark min-h-24 w-80 bg-base p-8'>
      <ProfileClaimFooter {...args} className='flex' />
    </div>
  ),
};

/** Brand, separator and label mirror inside a right-to-left page. */
export const Rtl: StoryObj<typeof ProfileClaimFooter> = {
  args: { label: 'اطلب الوصول' },
  render: args => (
    <div dir='rtl' lang='ar' className='dark min-h-24 w-full bg-base p-8'>
      <ProfileClaimFooter {...args} className='flex' />
    </div>
  ),
};
