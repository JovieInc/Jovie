import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { FeatureAccordion } from './FeatureAccordion';

const meta = {
  title: 'Marketing/FeatureAccordion/States',
  component: FeatureAccordion,
  parameters: { layout: 'centered' },
  decorators: [
    function AccordionFrame(Story) {
      return (
        <div className='w-full max-w-xl'>
          <Story />
        </div>
      );
    },
  ],
} satisfies Meta<typeof FeatureAccordion>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: no sub-items, so the accordion renders nothing. */
export const EmptyNoItems: Story = { args: { items: [] } };

/** Long content: a long title and description wrap inside the trigger. */
export const LongContentWrapped: Story = {
  args: {
    items: [
      {
        number: '3.1',
        title:
          'Fan intelligence that shows who keeps showing up across every channel and release',
        description:
          'See who keeps showing up, identify super-fans before they know they are, and follow each fan from the first stream to the front row without a spreadsheet in sight.',
      },
    ],
  },
};

/** Rtl: the trigger and icon mirror in a right-to-left layout. */
export const RtlItems: Story = {
  args: {
    items: [
      { number: '3.1', title: 'ذكاء الجمهور', description: 'اعرف من يتابعك.' },
      {
        number: '3.2',
        title: 'تتبع المصدر',
        description: 'اعرف مصدر كل معجب.',
      },
    ],
  },
  decorators: [
    function RtlFrame(Story) {
      return (
        <div dir='rtl' className='w-full max-w-xl'>
          <Story />
        </div>
      );
    },
  ],
};
