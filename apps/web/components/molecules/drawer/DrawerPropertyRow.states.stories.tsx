import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { DrawerPropertyRow } from './DrawerPropertyRow';

const CanvasFrame: Decorator = function CanvasFrame(Story) {
  return <div className='w-full max-w-md bg-surface-0 p-3'>{Story()}</div>;
};

const RtlFrame: Decorator = function RtlFrame(Story) {
  return (
    <div dir='rtl'>
      <Story />
    </div>
  );
};

const meta = {
  title: 'Molecules/Drawer/DrawerPropertyRow States',
  component: DrawerPropertyRow,
  parameters: {
    layout: 'centered',
  },
  decorators: [CanvasFrame],
  args: {
    label: 'Release status',
    value: 'Ready for review',
  },
} satisfies Meta<typeof DrawerPropertyRow>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Partial: the property has no value yet and says so in muted text. */
export const PartialMissingValue: Story = {
  args: {
    label: 'UPC',
    value: 'Not assigned yet',
    valueClassName: 'text-tertiary-token',
  },
};

/** Long content: a long value wraps in the value column, aligned to the top. */
export const LongContentValue: Story = {
  args: {
    align: 'start',
    label: 'Rights holder',
    value:
      'Independent Artist Collective and Partners Publishing Group, administered worldwide except for territories under an existing exclusive licence',
  },
};

/** Right-to-left: an interactive Arabic row inside an RTL drawer. */
export const RtlArabicInteractive: Story = {
  args: {
    interactive: true,
    onClick: fn(),
    label: 'الإصدار',
    value: 'ألبوم الصيف',
  },
  decorators: [RtlFrame],
};
