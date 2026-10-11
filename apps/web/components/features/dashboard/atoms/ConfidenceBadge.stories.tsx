import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ConfidenceBadge } from './ConfidenceBadge';

const meta = {
  title: 'Dashboard/Atoms/ConfidenceBadge',
  component: ConfidenceBadge,
  parameters: {
    layout: 'centered',
  },
  args: {
    score: 0.85,
  },
  argTypes: {
    score: {
      control: { type: 'range', min: 0, max: 1, step: 0.01 },
    },
    size: {
      control: 'select',
      options: ['sm', 'md'],
    },
  },
} satisfies Meta<typeof ConfidenceBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const High: Story = {
  args: { score: 0.92 },
};

export const Medium: Story = {
  args: { score: 0.65 },
};

export const Low: Story = {
  args: { score: 0.2 },
};

export const WithLabel: Story = {
  args: { score: 0.92, showLabel: true },
};

export const Small: Story = {
  args: { score: 0.65, size: 'sm', showLabel: true },
};

export const AllLevels: Story = {
  render: () => (
    <div className='flex items-center gap-2'>
      <ConfidenceBadge score={0.92} showLabel />
      <ConfidenceBadge score={0.65} showLabel />
      <ConfidenceBadge score={0.2} showLabel />
    </div>
  ),
};
