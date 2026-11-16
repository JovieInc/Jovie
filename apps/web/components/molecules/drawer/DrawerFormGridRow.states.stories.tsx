import { Input } from '@jovie/ui';
import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { DrawerFormGridRow } from './DrawerFormGridRow';

const CanvasFrame: Decorator = function CanvasFrame(Story) {
  return <div className='w-full max-w-md'>{Story()}</div>;
};

const RtlFrame: Decorator = function RtlFrame(Story) {
  return (
    <div dir='rtl'>
      <Story />
    </div>
  );
};

const meta = {
  title: 'Molecules/Drawer/DrawerFormGridRow States',
  component: DrawerFormGridRow,
  parameters: {
    layout: 'centered',
  },
  decorators: [CanvasFrame],
  args: {
    label: 'Release date',
    htmlFor: 'release-date-state',
    children: <Input id='release-date-state' defaultValue='2026-09-12' />,
  },
} satisfies Meta<typeof DrawerFormGridRow>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Partial: no label class override, so the default quaternary label shows. */
export const PartialDefaultLabel: Story = {};

/** Long content: a long label wraps inside the fixed label column. */
export const LongContentLabel: Story = {
  args: {
    label: 'Original release date across every territory',
  },
};

/** Right-to-left: the label column moves to the right in an RTL drawer. */
export const RtlArabicRow: Story = {
  args: {
    label: 'تاريخ الإصدار',
  },
  decorators: [RtlFrame],
};
