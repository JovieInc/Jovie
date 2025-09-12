import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Badge } from './Badge';

const meta: Meta<typeof Badge> = {
  title: 'Atoms/Badge',
  component: Badge,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: { type: 'select' },
      options: ['primary', 'secondary', 'success', 'warning', 'error'],
    },
    size: {
      control: { type: 'select' },
      options: ['sm', 'md', 'lg'],
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {
  args: {
    children: 'Primary',
    variant: 'primary',
    size: 'md',
  },
};

export const Secondary: Story = {
  args: {
    children: 'Secondary',
    variant: 'secondary',
    size: 'md',
  },
};

export const Success: Story = {
  args: {
    children: 'Success',
    variant: 'success',
    size: 'md',
  },
};

export const Warning: Story = {
  args: {
    children: 'Warning',
    variant: 'warning',
    size: 'md',
  },
};

export const Error: Story = {
  args: {
    children: 'Error',
    variant: 'error',
    size: 'md',
  },
};

export const Small: Story = {
  args: {
    children: 'Small',
    variant: 'primary',
    size: 'sm',
  },
};

export const Large: Story = {
  args: {
    children: 'Large',
    variant: 'primary',
    size: 'lg',
  },
};

export const AllVariants: Story = {
  render: () => (
    <div className='flex flex-wrap gap-2'>
      <Badge variant='primary'>Primary</Badge>
      <Badge variant='secondary'>Secondary</Badge>
      <Badge variant='success'>Success</Badge>
      <Badge variant='warning'>Warning</Badge>
      <Badge variant='error'>Error</Badge>
    </div>
  ),
};

export const AllSizes: Story = {
  render: () => (
    <div className='flex flex-wrap gap-2 items-center'>
      <Badge variant='primary' size='sm'>
        Small
      </Badge>
      <Badge variant='primary' size='md'>
        Medium
      </Badge>
      <Badge variant='primary' size='lg'>
        Large
      </Badge>
    </div>
  ),
};

export const WithNumbers: Story = {
  render: () => (
    <div className='flex flex-wrap gap-2'>
      <Badge variant='primary'>1</Badge>
      <Badge variant='success'>42</Badge>
      <Badge variant='warning'>99+</Badge>
      <Badge variant='error'>New</Badge>
    </div>
  ),
};

export const StatusBadges: Story = {
  render: () => (
    <div className='flex flex-col gap-4'>
      <div className='flex items-center gap-2'>
        <span>Account Status:</span>
        <Badge variant='success'>Active</Badge>
      </div>
      <div className='flex items-center gap-2'>
        <span>Plan:</span>
        <Badge variant='primary'>Pro</Badge>
      </div>
      <div className='flex items-center gap-2'>
        <span>Payment:</span>
        <Badge variant='warning'>Pending</Badge>
      </div>
      <div className='flex items-center gap-2'>
        <span>Issues:</span>
        <Badge variant='error'>Critical</Badge>
      </div>
    </div>
  ),
};
