import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { IconBadge } from './IconBadge';

const meta: Meta<typeof IconBadge> = {
  title: 'Atoms/IconBadge',
  component: IconBadge,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    name: {
      control: { type: 'select' },
      options: [
        'User',
        'Sparkles',
        'Bell',
        'Check',
        'AlertTriangle',
        'Bolt',
        'Music',
        'Settings',
      ],
    },
    colorVar: {
      control: { type: 'text' },
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    name: 'User',
    colorVar: '--color-red-500',
  },
};

export const BlueUser: Story = {
  args: {
    name: 'User',
    colorVar: '--color-blue-500',
  },
};

export const GreenCheck: Story = {
  args: {
    name: 'Check',
    colorVar: '--color-green-500',
  },
};

export const YellowSparkles: Story = {
  args: {
    name: 'Sparkles',
    colorVar: '--color-yellow-500',
  },
};

export const PurpleBell: Story = {
  args: {
    name: 'Bell',
    colorVar: '--color-purple-500',
  },
};

export const RedWarning: Story = {
  args: {
    name: 'AlertTriangle',
    colorVar: '--color-red-500',
  },
};

export const AllIcons: Story = {
  render: () => (
    <div className='flex gap-4'>
      <IconBadge name='User' colorVar='--color-red-500' />
      <IconBadge name='Sparkles' colorVar='--color-yellow-500' />
      <IconBadge name='Bell' colorVar='--color-purple-500' />
      <IconBadge name='Check' colorVar='--color-green-500' />
      <IconBadge name='AlertTriangle' colorVar='--color-orange-500' />
    </div>
  ),
};

export const CustomColors: Story = {
  render: () => (
    <div className='flex gap-4'>
      <IconBadge name='User' colorVar='--color-pink-500' />
      <IconBadge name='Sparkles' colorVar='--color-indigo-500' />
      <IconBadge name='Bell' colorVar='--color-teal-500' />
      <IconBadge name='Check' colorVar='--color-emerald-500' />
    </div>
  ),
};
