import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { InputAuraFrame } from './InputAuraFrame';

const meta = {
  title: 'Marketing/Home/InputAuraFrame',
  component: InputAuraFrame,
  parameters: {
    layout: 'centered',
    backgrounds: { default: 'dark' },
  },
} satisfies Meta<typeof InputAuraFrame>;

export default meta;
type Story = StoryObj<typeof meta>;

export const StaticContainedAura: Story = {
  render: () => (
    <InputAuraFrame className='w-80 p-1'>
      <div className='relative rounded-lg bg-neutral-950 px-4 py-3 text-sm text-white'>
        Search your artist name
      </div>
    </InputAuraFrame>
  ),
};
