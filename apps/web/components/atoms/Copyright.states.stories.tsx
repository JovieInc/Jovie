import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Copyright } from './Copyright';

/** Rendered states of the footer copyright line. */
const meta = {
  title: 'Atoms/Copyright/States',
  component: Copyright,
  parameters: { layout: 'centered' },
  render: function CopyrightOnBase(args) {
    return (
      <div className='rounded-md bg-base px-4 py-3'>
        <Copyright {...args} />
      </div>
    );
  },
} satisfies Meta<typeof Copyright>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Partial: no year passed, so the current copyright year is used. */
export const PartialDefaultYear: Story = {};

/** Long content: the line in a narrow footer column beside other text. */
export const LongContentNarrowColumn: Story = {
  args: { year: 2026, variant: 'light' },
  render: function NarrowCopyright(args) {
    return (
      <div className='w-24 rounded-md bg-surface-1 px-4 py-3'>
        <Copyright {...args} />
      </div>
    );
  },
};

/** Right to left: the line inside an Arabic footer. */
export const RtlFooter: Story = {
  args: { year: 2026, variant: 'light' },
  render: function RtlCopyright(args) {
    return (
      <div dir='rtl' lang='ar' className='rounded-md bg-surface-1 px-4 py-3'>
        <Copyright {...args} />
      </div>
    );
  },
};
