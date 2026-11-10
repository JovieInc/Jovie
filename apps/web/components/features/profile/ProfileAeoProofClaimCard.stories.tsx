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

/** Long content: a long artist name and note wrap without pushing the CTA off the card. */
export const LongArtistNameAndNote: StoryObj<typeof ProfileAeoProofClaimCard> =
  {
    args: {
      artistName: 'The Extraordinary Midnight Radio Orchestra and Friends',
      label: 'Reserve your name',
      note: 'Limited founding spots · Reserve your name before the next release window closes',
    },
    render: RequestAccess.render,
  };

/** RTL: the card keeps its CTA at the reading start, clear of the consent card. */
export const RtlRequestAccess: StoryObj<typeof ProfileAeoProofClaimCard> = {
  args: { artistName: 'نور الهدى', note: 'محدود · اطلب الوصول' },
  render: args => (
    <div dir='rtl' lang='ar' className='min-h-dvh bg-base text-primary-token'>
      <ProfileAeoProofClaimCard {...args} />
    </div>
  ),
};
