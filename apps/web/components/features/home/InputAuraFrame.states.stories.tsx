import { Input } from '@jovie/ui';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { InputAuraFrame } from './InputAuraFrame';

const meta = {
  title: 'Home/InputAuraFrame States',
  component: InputAuraFrame,
  parameters: { layout: 'fullscreen' },
  decorators: [
    function MetaDecorator(Story) {
      return (
        <div className='grid min-h-screen place-items-center p-4'>
          <Story />
        </div>
      );
    },
  ],
  args: { treatment: 'default', children: null },
} satisfies Meta<typeof InputAuraFrame>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Partial: the frame around a field that has only its label so far. */
export const Partial: Story = {
  args: {
    treatment: 'editorial',
    children: <Input aria-label='Search your name' />,
  },
};

/** Long content: a long typed name inside the glowing frame. */
export const LongContent: Story = {
  args: {
    children: (
      <Input
        aria-label='Search your name'
        defaultValue='Tim White and the Late Night Los Angeles Orchestra featuring Everyone'
      />
    ),
  },
};

/** Rtl: an Arabic name in a right-to-left field. */
export const Rtl: Story = {
  decorators: [
    function RtlDecorator(Story) {
      return (
        <div dir='rtl' lang='ar'>
          <Story />
        </div>
      );
    },
  ],
  args: {
    children: <Input aria-label='ابحث عن اسمك' defaultValue='تيم وايت' />,
  },
};
