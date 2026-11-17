import '@/app/globals.css';
import type { ReactNode } from 'react';
import '@/styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { HomeLoopTile } from '@/lib/home-loop/contract';
import {
  HOME_LOOP_FIXTURE_PULSE,
  HOME_LOOP_FIXTURE_UNMEASURED_PULSE,
} from './fixtures';
import { HomeLoopConstraintBanner, HomeLoopPulse } from './HomeLoopPulse';

function RtlFrame(Story: () => ReactNode) {
  return (
    <div dir='rtl'>
      <Story />
    </div>
  );
}

/**
 * State coverage for the pulse row and its constraint banner. The canonical
 * stories stay in HomeLoopPulse.stories.tsx; these change the tiles, the
 * banner's read and the document direction.
 */
const meta = {
  title: 'Organisms/HomeLoop/HomeLoopPulse States',
  component: HomeLoopPulse,
  parameters: { layout: 'padded' },
  args: { tiles: HOME_LOOP_FIXTURE_PULSE },
} satisfies Meta<typeof HomeLoopPulse>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: no tiles arrived, so empty frames hold the row's height. */
export const EmptyTiles: Story = { args: { tiles: [] } };

/**
 * Error: the read behind the row failed, so the banner says the state is
 * unknown (never the all-clear) and the tiles keep empty frames.
 */
export const ErrorReadUnknown: Story = {
  args: { tiles: [] },
  render: args => (
    <div className='flex flex-col gap-3'>
      <HomeLoopConstraintBanner
        constraint={null}
        emptyLabel='Nothing is blocking shipping'
        unknownLabel='Shipping data could not load.'
      />
      <HomeLoopPulse {...args} />
    </div>
  ),
};

/** Partial: some tiles are measured and others are not yet. */
export const PartialMeasured: Story = {
  args: {
    tiles: HOME_LOOP_FIXTURE_PULSE.map((tile, index) =>
      index % 2 ? HOME_LOOP_FIXTURE_UNMEASURED_PULSE[index] : tile
    ),
  },
};

const longTile: HomeLoopTile = {
  key: 'long',
  label: 'Median time from first page to verified production fix',
  value: '3 days 14 hours',
  was: '2 days 22 hours',
  tone: 'warn',
  measured: true,
  target: 'Target under one business day',
  href: '/app/ov/product',
};

/** Long content: long labels and values truncate; extra tiles are hidden, not wrapped. */
export const LongContentTiles: Story = {
  args: {
    tiles: [
      longTile,
      ...HOME_LOOP_FIXTURE_PULSE,
      ...HOME_LOOP_FIXTURE_PULSE.map(tile => ({
        ...tile,
        key: `${tile.key}-copy`,
      })),
    ],
  },
  render: args => (
    <div className='flex flex-col gap-3'>
      <HomeLoopConstraintBanner
        constraint={{
          tone: 'bad',
          text: 'About 500 issues show In Progress with no live owner, so 0 of 28 Todo issues are eligible for pickup and the queue is idle',
          detailsHref: '/app/ov/product',
        }}
        emptyLabel='Nothing is blocking shipping'
      />
      <HomeLoopPulse {...args} />
    </div>
  ),
};

/** Right-to-left: the row inside an RTL document. */
export const RtlDocument: Story = {
  args: {
    tiles: HOME_LOOP_FIXTURE_PULSE.map((tile, index) =>
      index === 0 ? { ...tile, label: 'الإنتاج' } : tile
    ),
  },
  decorators: [RtlFrame],
};
