import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ClaimBanner } from './ClaimBanner';

const meta: Meta<typeof ClaimBanner> = {
  title: 'Profile/ClaimBanner',
  component: ClaimBanner,
  parameters: {
    layout: 'fullscreen',
  },
};

export default meta;
type Story = StoryObj<typeof ClaimBanner>;

export const Default: Story = {
  args: {
    profileHandle: 'johndoe',
  },
};

export const WithDisplayName: Story = {
  args: {
    profileHandle: 'johndoe',
    displayName: 'John Doe',
  },
};

export const LongName: Story = {
  args: {
    profileHandle: 'theofficialartistname',
    displayName: 'The Official Artist Name',
  },
};

export const InProfileContext: Story = {
  render: () => (
    <div className='min-h-screen bg-base text-primary-token'>
      <ClaimBanner profileHandle='artistname' displayName='Artist Name' />
      <div className='p-8 text-center'>
        <p className='text-secondary'>Profile content would appear here...</p>
      </div>
    </div>
  ),
};

/** Partial: no verified Spotify identity, so the banner states ownership with no claim action. */
export const PartialNoClaimAction: Story = {
  args: {
    profileHandle: 'artistname',
    displayName: 'Artist Name',
    variant: 'unsupported',
  },
};

/** RTL: copy and CTA follow the reading direction; the CTA label never wraps. */
export const RtlArabicName: Story = {
  render: () => (
    <div dir='rtl' lang='ar'>
      <ClaimBanner
        profileHandle='nour'
        displayName='نور الهدى'
        ctaHref='/nour/claim?next=auth'
        variant='claim_intent'
      />
    </div>
  ),
};
