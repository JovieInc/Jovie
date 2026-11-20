import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { DrawerInspectorStack } from './DrawerInspectorStack';
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
  title: 'Molecules/Drawer/DrawerInspectorStack States',
  component: DrawerInspectorStack,
  parameters: {
    layout: 'centered',
  },
  decorators: [CanvasFrame],
  args: {
    children: (
      <>
        <DrawerPropertyRow label='Release' value='Summer EP' />
        <DrawerPropertyRow label='Status' value='Draft' />
      </>
    ),
    'data-testid': 'inspector-stack-state',
  },
} satisfies Meta<typeof DrawerInspectorStack>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Long content: many long rows stacked in one column. */
export const LongContentManyRows: Story = {
  args: {
    children: (
      <>
        <DrawerPropertyRow
          label='Release'
          value='Summer EP (Deluxe Edition with Bonus Remixes and Acoustic Versions)'
        />
        <DrawerPropertyRow label='Status' value='Draft, waiting on artwork' />
        <DrawerPropertyRow label='Label' value='Self-released' />
        <DrawerPropertyRow label='Genre' value='Indie pop, electronic' />
        <DrawerPropertyRow label='Release date' value='September 12, 2026' />
        <DrawerPropertyRow label='Territories' value='Worldwide' />
      </>
    ),
  },
};

/** Right-to-left: Arabic rows inside an RTL drawer. */
export const RtlArabicRows: Story = {
  args: {
    children: (
      <>
        <DrawerPropertyRow label='الإصدار' value='ألبوم الصيف' />
        <DrawerPropertyRow label='الحالة' value='مسودة' />
      </>
    ),
  },
  decorators: [RtlFrame],
};
