import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { GradientText } from './GradientText';

const meta: Meta<typeof GradientText> = {
  title: 'Atoms/GradientText',
  component: GradientText,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: { type: 'select' },
      options: ['primary', 'secondary', 'success', 'warning', 'purple-cyan'],
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {
  args: {
    children: 'handle',
    variant: 'primary',
  },
};

export const Secondary: Story = {
  args: {
    children: 'Secondary Text',
    variant: 'secondary',
  },
};

export const Success: Story = {
  args: {
    children: 'Success Text',
    variant: 'success',
  },
};

export const Warning: Story = {
  args: {
    children: 'Warning Text',
    variant: 'warning',
  },
};

export const PurpleCyan: Story = {
  args: {
    children: 'Convert',
    variant: 'purple-cyan',
  },
};

export const InHeading: Story = {
  render: () => (
    <h1 className='text-4xl font-bold'>
      Claim your <GradientText variant='primary'>handle</GradientText>
    </h1>
  ),
};

export const InLargeHeading: Story = {
  render: () => (
    <h1 className='text-6xl font-semibold'>
      Built to <GradientText variant='purple-cyan'>Convert</GradientText>
    </h1>
  ),
};

export const AllVariants: Story = {
  render: () => (
    <div className='space-y-4 text-center'>
      <div className='text-2xl font-semibold'>
        <GradientText variant='primary'>Primary Gradient</GradientText>
      </div>
      <div className='text-2xl font-semibold'>
        <GradientText variant='secondary'>Secondary Gradient</GradientText>
      </div>
      <div className='text-2xl font-semibold'>
        <GradientText variant='success'>Success Gradient</GradientText>
      </div>
      <div className='text-2xl font-semibold'>
        <GradientText variant='warning'>Warning Gradient</GradientText>
      </div>
      <div className='text-2xl font-semibold'>
        <GradientText variant='purple-cyan'>Purple-Cyan Gradient</GradientText>
      </div>
    </div>
  ),
};

export const DifferentSizes: Story = {
  render: () => (
    <div className='space-y-4 text-center'>
      <div className='text-sm'>
        Small: <GradientText>handle</GradientText>
      </div>
      <div className='text-lg'>
        Large: <GradientText>handle</GradientText>
      </div>
      <div className='text-2xl'>
        2XL: <GradientText>handle</GradientText>
      </div>
      <div className='text-4xl'>
        4XL: <GradientText>handle</GradientText>
      </div>
      <div className='text-6xl'>
        6XL: <GradientText>handle</GradientText>
      </div>
    </div>
  ),
};
