import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Bell, Menu, Settings, X } from 'lucide-react';
import { HeaderIconButton } from './HeaderIconButton';

const meta: Meta<typeof HeaderIconButton> = {
  title: 'Atoms/HeaderIconButton',
  component: HeaderIconButton,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'A circular icon button designed for use in headers and navigation.',
      },
    },
  },
  argTypes: {
    size: {
      control: 'select',
      options: ['xs', 'sm', 'md'],
      description: 'Size of the button',
    },
    variant: {
      control: 'select',
      options: ['ghost', 'outline', 'secondary'],
      description: 'Visual style variant',
    },
    ariaLabel: {
      control: 'text',
      description: 'Accessible label for screen readers',
    },
  },
};

export default meta;
type Story = StoryObj<typeof HeaderIconButton>;

export const Default: Story = {
  args: {
    ariaLabel: 'Menu',
    children: <Menu className='h-5 w-5' />,
  },
};

export const ExtraSmall: Story = {
  args: {
    size: 'xs',
    ariaLabel: 'Close',
    children: <X className='h-4 w-4' />,
  },
};

export const Small: Story = {
  args: {
    size: 'sm',
    ariaLabel: 'Settings',
    children: <Settings className='h-4 w-4' />,
  },
};

export const Medium: Story = {
  args: {
    size: 'md',
    ariaLabel: 'Notifications',
    children: <Bell className='h-5 w-5' />,
  },
};

export const AllSizes: Story = {
  render: () => (
    <div className='flex items-center gap-4'>
      <div className='flex flex-col items-center gap-2'>
        <HeaderIconButton size='xs' ariaLabel='Extra small'>
          <X className='h-4 w-4' />
        </HeaderIconButton>
        <span className='text-xs text-secondary-token'>xs</span>
      </div>
      <div className='flex flex-col items-center gap-2'>
        <HeaderIconButton size='sm' ariaLabel='Small'>
          <Settings className='h-4 w-4' />
        </HeaderIconButton>
        <span className='text-xs text-secondary-token'>sm</span>
      </div>
      <div className='flex flex-col items-center gap-2'>
        <HeaderIconButton size='md' ariaLabel='Medium'>
          <Bell className='h-5 w-5' />
        </HeaderIconButton>
        <span className='text-xs text-secondary-token'>md</span>
      </div>
    </div>
  ),
};

export const OutlineVariant: Story = {
  args: {
    variant: 'outline',
    ariaLabel: 'Menu',
    children: <Menu className='h-5 w-5' />,
  },
};

export const SecondaryVariant: Story = {
  args: {
    variant: 'secondary',
    ariaLabel: 'Settings',
    children: <Settings className='h-5 w-5' />,
  },
};
