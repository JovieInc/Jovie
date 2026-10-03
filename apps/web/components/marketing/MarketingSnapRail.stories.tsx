import Image from 'next/image';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { getMarketingExportImage } from '@/lib/screenshots/registry';
import { MarketingSnapRail } from './MarketingSnapRail';

// Real /artist-profiles release-cycle moments, matching
// ArtistProfileSocialProof.tsx's ArtistProfileReleaseCycleGallery.
const PROFILE_STATES = [
  {
    id: 'presave',
    label: 'Before The Drop',
    action: 'Release Alerts',
    image: getMarketingExportImage('tim-white-profile-subscribe-mobile'),
    alt: 'Tim White artist profile inviting fans to get release updates.',
  },
  {
    id: 'tour',
    label: 'On The Road',
    action: 'Nearby Tickets',
    image: getMarketingExportImage('tim-white-profile-tour-mobile'),
    alt: 'Tim White artist profile showing nearby tour dates.',
  },
  {
    id: 'pay',
    label: 'In The Room',
    action: 'Direct Support',
    image: getMarketingExportImage('tim-white-profile-pay-mobile'),
    alt: 'Tim White artist profile showing direct support options.',
  },
] as const;

const meta = {
  title: 'Marketing/MarketingSnapRail',
  component: MarketingSnapRail,
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    ariaLabel: 'One Artist Profile Across Three Release-cycle Moments',
    instructions:
      'Use the previous and next buttons, or swipe, to view every moment.',
    showMobileControls: true,
    showDesktopControls: false,
    previousLabel: 'Show Previous Release-cycle Moment',
    nextLabel: 'Show Next Release-cycle Moment',
    children: PROFILE_STATES.map(state => (
      <figure key={state.id} className='snap-start'>
        <div className='relative h-96 w-64 overflow-hidden border border-subtle bg-surface-0'>
          <Image
            fill
            src={state.image.publicUrl}
            alt={state.alt}
            className='object-contain object-top'
            sizes='256px'
          />
        </div>
        <figcaption className='mt-4 flex items-baseline justify-between gap-4 border-t border-subtle pt-3'>
          <strong className='text-sm font-semibold text-primary-token'>
            {state.label}
          </strong>
          <span className='text-xs text-tertiary-token'>{state.action}</span>
        </figcaption>
      </figure>
    )),
  },
} satisfies Meta<typeof MarketingSnapRail>;

export default meta;
type Story = StoryObj<typeof meta>;

export const MobileControls: Story = {};

export const DesktopControls: Story = {
  args: {
    showMobileControls: false,
    showDesktopControls: true,
  },
};
