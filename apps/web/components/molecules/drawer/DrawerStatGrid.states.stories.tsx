import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { DrawerStatGrid } from './DrawerStatGrid';
import { StatTile } from './StatTile';

const CanvasFrame: Decorator = function CanvasFrame(Story) {
  return (
    <div className='w-80 bg-surface-0'>
      <Story />
    </div>
  );
};

const RtlFrame: Decorator = function RtlFrame(Story) {
  return (
    <div dir='rtl'>
      <Story />
    </div>
  );
};

const meta = {
  title: 'Molecules/Drawer/DrawerStatGrid States',
  component: DrawerStatGrid,
  parameters: {
    layout: 'centered',
  },
  decorators: [CanvasFrame],
  args: {
    variant: 'card',
    children: (
      <>
        <StatTile label='Views' value='12.4k' hint='+8% vs last week' />
        <StatTile label='Clicks' value='3,204' hint='+2% vs last week' />
      </>
    ),
  },
} satisfies Meta<typeof DrawerStatGrid>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Partial: one stat is measured and the other is not wired yet. */
export const PartialOneMeasured: Story = {
  args: {
    children: (
      <>
        <StatTile label='Views' value='12.4k' />
        <StatTile
          label='Streams'
          state='not-measured'
          notMeasuredSource='streaming ingestion'
        />
      </>
    ),
  },
};

/** Long content: long labels and hints wrap inside each half. */
export const LongContentStats: Story = {
  args: {
    children: (
      <>
        <StatTile
          label='Top referrer territory this quarter'
          value='1,234,567'
          hint='Leading territory by referred clicks over the rolling quarter'
        />
        <StatTile
          label='Streams over the rolling quarter window'
          value='89,432'
          hint='Across every connected streaming service'
        />
      </>
    ),
  },
};

/** Right-to-left: Arabic stats inside an RTL drawer. */
export const RtlArabicStats: Story = {
  args: {
    children: (
      <>
        <StatTile label='المشاهدات' value='١٢٫٤ ألف' hint='+٨٪' />
        <StatTile label='النقرات' value='٣٬٢٠٤' hint='+٢٪' />
      </>
    ),
  },
  decorators: [RtlFrame],
};
