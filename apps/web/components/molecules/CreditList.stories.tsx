import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { CreditList } from './CreditList';

const meta = {
  title: 'Molecules/CreditList',
  component: CreditList,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof CreditList>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    names: ['Vigel', 'Cosmic Gate', 'Tim White'],
  },
};

/** Clickable credits: each name renders through renderName, literals dimmed. */
export const ClickableNames: Story = {
  args: {
    names: ['Vigel', 'Tim White'],
    fallback: 'Solo Artist',
    renderName: name => (
      <span className='cursor-pointer font-medium text-primary-token underline-offset-2 hover:underline'>
        {name}
      </span>
    ),
    literalClassName: 'text-secondary-token',
  },
};

/** No credits left after normalization: the fallback line renders instead. */
export const FallbackOnly: Story = {
  args: {
    names: [],
    fallback: 'Solo Artist',
  },
};
