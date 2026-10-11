import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ConfettiOverlay } from './Confetti';

const meta = {
  title: 'Atoms/Confetti',
  component: ConfettiOverlay,
  parameters: {
    layout: 'centered',
  },
  args: {
    count: 40,
  },
  render: args => (
    <div className='relative h-64 w-96 overflow-hidden rounded-lg border border-subtle bg-surface-1'>
      <ConfettiOverlay {...args} />
    </div>
  ),
} satisfies Meta<typeof ConfettiOverlay>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const FewParticles: Story = {
  args: {
    count: 12,
  },
};

export const CustomColors: Story = {
  args: {
    colors: ['var(--color-accent)', 'var(--color-accent-blue)'],
  },
};
