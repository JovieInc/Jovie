import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Spacer } from './Spacer';

const meta: Meta<typeof Spacer> = {
  title: 'Atoms/Spacer',
  component: Spacer,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: 'A simple spacer component for adding vertical spacing.',
      },
    },
  },
  argTypes: {
    size: {
      control: 'select',
      options: ['sm', 'md', 'lg', 'xl'],
      description: 'Size of the spacer',
    },
  },
  decorators: [
    Story => (
      <div className='flex flex-col'>
        <div className='bg-surface-2 p-4 text-sm'>Content above</div>
        <Story />
        <div className='bg-surface-2 p-4 text-sm'>Content below</div>
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof Spacer>;

export const Default: Story = {
  args: {
    size: 'md',
  },
};

export const Small: Story = {
  args: {
    size: 'sm',
  },
};

export const Medium: Story = {
  args: {
    size: 'md',
  },
};

export const Large: Story = {
  args: {
    size: 'lg',
  },
};

export const ExtraLarge: Story = {
  args: {
    size: 'xl',
  },
};

export const AllSizes: Story = {
  render: () => (
    <div className='space-y-4'>
      {(['sm', 'md', 'lg', 'xl'] as const).map(size => (
        <div key={size} className='flex items-center gap-4'>
          <span className='w-12 text-sm font-medium'>{size}</span>
          <div className='flex flex-1 flex-col'>
            <div className='bg-surface-2 p-2 text-xs'>Above</div>
            <Spacer size={size} className='bg-accent/20' />
            <div className='bg-surface-2 p-2 text-xs'>Below</div>
          </div>
        </div>
      ))}
    </div>
  ),
};
