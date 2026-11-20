import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReactNode } from 'react';
import { FooterBranding } from './FooterBranding';

function NarrowFooterDecorator(Story: () => ReactNode) {
  return (
    <div className='w-32'>
      <Story />
    </div>
  );
}

function RtlFooterDecorator(Story: () => ReactNode) {
  return (
    <div dir='rtl' lang='ar'>
      <Story />
    </div>
  );
}

const meta = {
  title: 'Molecules/FooterBranding/States',
  component: FooterBranding,
  parameters: { layout: 'centered' },
  args: { mark: 'text', size: 'sm' },
} satisfies Meta<typeof FooterBranding>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: no artist handle, so both links point at the plain routes. */
export const EmptyArtistHandle: Story = {
  args: { showCTA: true },
};

/** Partial: the text mark without the claim-your-handle link. */
export const PartialTextMarkOnly: Story = {
  args: { showCTA: false, artistHandle: 'nova' },
};

/** Long content: a long handle and both links in a narrow footer. */
export const LongContentNarrowFooter: Story = {
  args: {
    showCTA: true,
    artistHandle: 'the-midnight-orchestra-and-friends-official',
  },
  decorators: [NarrowFooterDecorator],
};

/** RTL: the footer in a right-to-left profile. */
export const RtlFooter: Story = {
  args: { showCTA: true, artistHandle: 'nova' },
  decorators: [RtlFooterDecorator],
};
