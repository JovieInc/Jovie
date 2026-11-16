import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Music } from 'lucide-react';
import { FigCard } from './FigCard';

const meta = {
  title: 'Marketing/FigCard States',
  component: FigCard,
  args: {
    title: 'Built for artists',
    description:
      'Built around how independent artists launch, with one home for every release moment.',
    icon: <Music className='h-5 w-5' />,
  },
  decorators: [
    Story => (
      <div className='w-80 max-w-full'>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof FigCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Partial: no icon, so the card leads with its title. */
export const PartialNoIcon: Story = { args: { icon: undefined } };

/** Long content: a wrapping title and a long description. */
export const LongContentDescription: Story = {
  args: {
    title: 'Built for independent artists, managers and the labels behind them',
    description:
      'Built around how independent artists actually launch: one home for every release moment, from the first teaser and presave to release week, the tour that follows and every fan who asked to hear about the next record.',
  },
};

/** Right-to-left: Arabic card copy in an Arabic document direction. */
export const RtlArabic: Story = {
  args: {
    title: 'مصمم للفنانين',
    description: 'مبني حول طريقة إطلاق الفنانين المستقلين لأعمالهم.',
  },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
};
