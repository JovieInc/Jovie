import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { ActiveFilterPill } from './ActiveFilterPill';

const CanvasFrame: Decorator = function CanvasFrame(Story) {
  return (
    <div className='max-w-sm'>
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
  title: 'Molecules/Filters/ActiveFilterPill States',
  component: ActiveFilterPill,
  parameters: {
    layout: 'centered',
  },
  args: {
    groupLabel: 'Status',
    values: ['Todo'],
    onClear: fn(),
  },
} satisfies Meta<typeof ActiveFilterPill>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: no values are selected, so the pill does not render. */
export const EmptyNoValues: Story = {
  args: {
    values: [],
  },
};

/** Long content: a long group label and a long single value. */
export const LongContentValue: Story = {
  args: {
    groupLabel: 'Distribution territory',
    values: ['Worldwide except territories under an exclusive licence'],
  },
  decorators: [CanvasFrame],
};

/** Right-to-left: Arabic group label and value inside an RTL toolbar. */
export const RtlArabicFilter: Story = {
  args: {
    groupLabel: 'الحالة',
    values: ['قيد التنفيذ'],
  },
  decorators: [RtlFrame],
};
