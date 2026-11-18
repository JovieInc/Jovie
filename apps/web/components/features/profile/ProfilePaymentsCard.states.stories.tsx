import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { resolveProfileModeCardAccents } from '@/lib/profile/mode-card-accent';
import { ProfilePaymentsCard } from './ProfilePaymentsCard';

/**
 * Rendered states of the payments mode card. The default story lives in
 * ProfilePaymentsCard.stories.tsx.
 */
const CardFrame: Decorator = function CardFrame(Story) {
  return (
    <div className='w-sm max-w-full bg-base p-4'>
      <Story />
    </div>
  );
};

const RtlCardFrame: Decorator = function RtlCardFrame(Story) {
  return (
    <div dir='rtl' lang='ar'>
      <Story />
    </div>
  );
};

const meta = {
  title: 'Profile/ProfilePaymentsCard/States',
  component: ProfilePaymentsCard,
  parameters: { layout: 'centered' },
  decorators: [CardFrame],
  args: {
    artistName: 'Tim White',
    venmoLink: 'https://venmo.com/u/timwhite',
    accent: resolveProfileModeCardAccents({ listenArtworkAccent: 'ultra' })
      .payments,
    renderMode: 'interactive',
  },
} satisfies Meta<typeof ProfilePaymentsCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: no amount chips are offered, so only the default CTA shows. */
export const EmptyNoAmounts: Story = {
  args: { amounts: [] },
};

/** Error: an unsafe payment link renders no card at all. */
export const ErrorUnsafeVenmoLink: Story = {
  args: { venmoLink: 'http://venmo.com/u/timwhite' },
};

/** Partial: two custom amounts, and a default that is not one of them. */
export const PartialCustomAmounts: Story = {
  args: { amounts: [3, 7], defaultAmount: 10 },
};

/** Partial: the preview render mode, with the amount chips inert. */
export const PartialPreviewMode: Story = {
  args: { renderMode: 'preview' },
};

/** Long content: a long artist name in the title, description and CTA. */
export const LongContentArtistName: Story = {
  args: {
    artistName:
      'The Midnight Collective Orchestra and Friends Featuring Special Guests',
    amounts: [25, 100, 250],
    defaultAmount: 250,
  },
};

/** Right-to-left: an Arabic artist name in an Arabic document direction. */
export const RtlArabicArtist: Story = {
  args: { artistName: 'فرقة منتصف الليل' },
  decorators: [RtlCardFrame],
};
