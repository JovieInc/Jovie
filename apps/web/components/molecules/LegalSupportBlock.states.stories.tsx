import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReactNode } from 'react';
import { LegalSupportBlock } from './LegalSupportBlock';

function NarrowColumnDecorator(Story: () => ReactNode) {
  return (
    <div className='w-56'>
      <Story />
    </div>
  );
}

function RtlColumnDecorator(Story: () => ReactNode) {
  return (
    <div dir='rtl' lang='ar' className='w-64'>
      <Story />
    </div>
  );
}

const meta = {
  title: 'Molecules/LegalSupportBlock/States',
  component: LegalSupportBlock,
  parameters: { layout: 'padded' },
  args: {
    description: 'Questions about this policy? Our team is happy to help.',
    email: 'privacy@jov.ie',
  },
} satisfies Meta<typeof LegalSupportBlock>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Long content: a long description and address in a narrow side column. */
export const LongContentNarrowColumn: Story = {
  args: {
    title: 'Questions about data processing and sub-processors',
    description:
      'If you have questions about how we process personal data on behalf of your label, distributor or management company, write to us and the privacy team will reply within two business days.',
    email: 'data-protection-requests@jov.ie',
  },
  decorators: [NarrowColumnDecorator],
};

/** RTL: Arabic copy in a right-to-left column. */
export const RtlArabicCopy: Story = {
  args: {
    title: 'هل تحتاج إلى مساعدة؟',
    description: 'لديك أسئلة حول هذه السياسة؟ فريقنا سعيد بمساعدتك.',
  },
  decorators: [RtlColumnDecorator],
};
