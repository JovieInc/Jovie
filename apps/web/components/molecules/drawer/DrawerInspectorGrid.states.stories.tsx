import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { DrawerInspectorGrid } from './DrawerInspectorGrid';
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
  title: 'Molecules/Drawer/DrawerInspectorGrid States',
  component: DrawerInspectorGrid,
  parameters: {
    layout: 'centered',
  },
  decorators: [CanvasFrame],
  args: {
    children: (
      <>
        <DrawerPropertyRow label='Status' value='Ready' />
        <DrawerPropertyRow label='Audience' value='1,240 contacts' />
      </>
    ),
    'data-testid': 'inspector-grid-state',
  },
} satisfies Meta<typeof DrawerInspectorGrid>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Partial: one row has no reading yet and says so. */
export const PartialPendingRow: Story = {
  args: {
    children: (
      <>
        <DrawerPropertyRow label='Status' value='Ready' />
        <DrawerPropertyRow
          label='Audience'
          value='Not counted yet'
          valueClassName='text-tertiary-token'
        />
      </>
    ),
  },
};

/** Long content: long labels and values against a wider label column. */
export const LongContentRows: Story = {
  args: {
    labelWidth: 128,
    children: (
      <>
        <DrawerPropertyRow
          label='Primary audience segment'
          value='Returning listeners who saved two or more releases in the last 90 days'
        />
        <DrawerPropertyRow
          label='Notification channel'
          value='Email and SMS, with push notifications for app users'
        />
      </>
    ),
  },
};

/** Right-to-left: Arabic rows inside an RTL drawer. */
export const RtlArabicRows: Story = {
  args: {
    children: (
      <>
        <DrawerPropertyRow label='الحالة' value='جاهز' />
        <DrawerPropertyRow label='الجمهور' value='١٬٢٤٠ جهة اتصال' />
      </>
    ),
  },
  decorators: [RtlFrame],
};
