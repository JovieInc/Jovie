import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AiDemo } from './AiDemo';

const meta = {
  title: 'Features/Home/AiDemo/States',
  component: AiDemo,
  parameters: { layout: 'centered' },
  decorators: [
    function WidthDecorator(Story) {
      return (
        <div className='w-full max-w-md'>
          <Story />
        </div>
      );
    },
  ],
} satisfies Meta<typeof AiDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: the premium demo with no context chips shows only the prompt. */
export const EmptyNoChips: Story = {
  args: { variant: 'premium', contextChips: [] },
};

/** Partial: the default demo while its first segments are still typing. */
export const PartialTyping: Story = {
  args: { variant: 'default' },
};

/** Long content: many long context chips wrap inside the header. */
export const LongContentChips: Story = {
  args: {
    variant: 'premium',
    contextChips: [
      'Verified artist profile with every release imported',
      'Catalog of 21 releases across 4 projects',
      '1.2M lifetime streams on Spotify',
      'Based in Los Angeles',
    ],
  },
};

/** Right to left: the demo under an Arabic document direction. */
export const RtlOverflow: Story = {
  args: { variant: 'premium', contextChips: ['ملف موثق'] },
  decorators: [
    function RtlDecorator(Story) {
      return (
        <div dir='rtl' lang='ar' className='w-full max-w-md'>
          <Story />
        </div>
      );
    },
  ],
};
