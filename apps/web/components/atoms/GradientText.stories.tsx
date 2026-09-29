import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { GradientText } from './GradientText';

const meta = {
  title: 'Atoms/GradientText',
  component: GradientText,
  parameters: {
    layout: 'centered',
  },
  args: {
    children: 'Jovie',
  },
  render: args => (
    <span className='text-3xl font-semibold'>
      <GradientText {...args} />
    </span>
  ),
} satisfies Meta<typeof GradientText>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {};

export const Secondary: Story = {
  args: {
    variant: 'secondary',
  },
};

export const Success: Story = {
  args: {
    variant: 'success',
  },
};

export const Warning: Story = {
  args: {
    variant: 'warning',
  },
};

export const PurpleCyan: Story = {
  args: {
    variant: 'purple-cyan',
  },
};

export const AsHeading: Story = {
  args: {
    as: 'h2',
    children: 'Grow your audience',
  },
  render: args => <GradientText {...args} />,
};
