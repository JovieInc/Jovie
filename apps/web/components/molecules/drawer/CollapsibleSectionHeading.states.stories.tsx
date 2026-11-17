import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReactNode } from 'react';
import { fn } from 'storybook/test';
import { CollapsibleSectionHeading } from './CollapsibleSectionHeading';

function SectionDecorator(Story: () => ReactNode) {
  return (
    <div className='w-60 text-primary-token'>
      <Story />
      <div id='section-details' className='px-2.5 py-2 text-secondary-token'>
        Section details content
      </div>
    </div>
  );
}

function RtlSectionDecorator(Story: () => ReactNode) {
  return (
    <div dir='rtl' lang='ar' className='w-60 text-primary-token'>
      <Story />
      <div id='section-details' className='px-2.5 py-2 text-secondary-token'>
        محتوى القسم
      </div>
    </div>
  );
}

const meta = {
  title: 'Molecules/Drawer/CollapsibleSectionHeading/States',
  component: CollapsibleSectionHeading,
  parameters: { layout: 'centered' },
  decorators: [SectionDecorator],
  args: {
    isOpen: true,
    onToggle: fn(),
    children: 'Audience details',
    'aria-controls': 'section-details',
  },
} satisfies Meta<typeof CollapsibleSectionHeading>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: a collapsed section, so its content is not shown. */
export const EmptyCollapsed: Story = {
  args: { isOpen: false, 'aria-controls': undefined },
};

/** Long content: a heading wider than the drawer column. */
export const LongContentHeading: Story = {
  args: {
    children: 'Audience details, top cities and returning listener trends',
  },
};

/** RTL: an Arabic heading in a right-to-left drawer. */
export const RtlHeading: Story = {
  args: { children: 'تفاصيل الجمهور' },
  decorators: [RtlSectionDecorator],
};
