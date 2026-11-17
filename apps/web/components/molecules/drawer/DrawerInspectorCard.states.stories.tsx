import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { DrawerInspectorCard } from './DrawerInspectorCard';
import { DrawerPropertyRow } from './DrawerPropertyRow';

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
  title: 'Molecules/Drawer/DrawerInspectorCard States',
  component: DrawerInspectorCard,
  parameters: {
    layout: 'centered',
  },
  decorators: [CanvasFrame],
  args: {
    title: 'Details',
    children: (
      <>
        <DrawerPropertyRow label='ISRC' value='USRC17607839' />
        <DrawerPropertyRow label='UPC' value='888880123456' />
      </>
    ),
  },
} satisfies Meta<typeof DrawerInspectorCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Partial: a card with one known property and one still missing. */
export const PartialMissingValue: Story = {
  args: {
    children: (
      <>
        <DrawerPropertyRow label='ISRC' value='USRC17607839' />
        <DrawerPropertyRow
          label='UPC'
          value='Not assigned yet'
          valueClassName='text-tertiary-token'
        />
      </>
    ),
  },
};

/** Long content: a long title and many long rows. */
export const LongContentRows: Story = {
  args: {
    title: 'Distribution and rights details for every territory',
    labelWidth: 120,
    children: (
      <>
        <DrawerPropertyRow
          label='Rights holder'
          value='Independent Artist Collective and Partners Publishing Group'
        />
        <DrawerPropertyRow
          label='Territories'
          value='Worldwide except territories under an existing exclusive licence'
        />
        <DrawerPropertyRow label='ISRC' value='USRC17607839' />
        <DrawerPropertyRow label='UPC' value='888880123456' />
        <DrawerPropertyRow label='Label' value='Self-released' />
      </>
    ),
  },
};

/** Right-to-left: Arabic title and rows inside an RTL drawer. */
export const RtlArabicCard: Story = {
  args: {
    title: 'التفاصيل',
    children: (
      <>
        <DrawerPropertyRow label='الحالة' value='جاهز' />
        <DrawerPropertyRow label='الجمهور' value='١٬٢٤٠ جهة اتصال' />
      </>
    ),
  },
  decorators: [RtlFrame],
};
