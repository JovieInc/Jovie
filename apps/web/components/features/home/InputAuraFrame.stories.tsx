import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { InputAuraFrame } from './InputAuraFrame';

const meta = {
  title: 'Home/InputAuraFrame',
  component: InputAuraFrame,
  parameters: {
    layout: 'fullscreen',
  },
  render: args => (
    <div
      style={{
        display: 'grid',
        minHeight: '100vh',
        placeItems: 'center',
        padding: 'var(--space-4, 16px)',
      }}
    >
      <InputAuraFrame {...args}>
        <input
          aria-label='Search your name'
          style={{
            background: 'transparent',
            border: 'none',
            color: 'inherit',
            font: 'inherit',
            outline: 'none',
          }}
        />
      </InputAuraFrame>
    </div>
  ),
} satisfies Meta<typeof InputAuraFrame>;

export default meta;
type Story = StoryObj<typeof meta>;

export const DefaultConic: Story = {
  args: {
    treatment: 'default',
  },
};

export const Editorial: Story = {
  args: {
    treatment: 'editorial',
  },
};
