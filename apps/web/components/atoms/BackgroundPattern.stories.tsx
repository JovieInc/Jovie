import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { BackgroundPattern } from './BackgroundPattern';

const meta: Meta<typeof BackgroundPattern> = {
  title: 'Atoms/BackgroundPattern',
  component: BackgroundPattern,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: { type: 'select' },
      options: ['grid', 'dots', 'gradient'],
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Grid: Story = {
  args: {
    variant: 'grid',
  },
  render: args => (
    <div className='relative h-96 w-full'>
      <BackgroundPattern {...args} />
      <div className='relative z-10 flex items-center justify-center h-full'>
        <div className='text-center'>
          <h2 className='text-2xl font-bold text-gray-900 dark:text-white mb-2'>
            Grid Pattern
          </h2>
          <p className='text-gray-600 dark:text-gray-400'>
            Subtle grid pattern background
          </p>
        </div>
      </div>
    </div>
  ),
};

export const Dots: Story = {
  args: {
    variant: 'dots',
  },
  render: args => (
    <div className='relative h-96 w-full'>
      <BackgroundPattern {...args} />
      <div className='relative z-10 flex items-center justify-center h-full'>
        <div className='text-center'>
          <h2 className='text-2xl font-bold text-gray-900 dark:text-white mb-2'>
            Dots Pattern
          </h2>
          <p className='text-gray-600 dark:text-gray-400'>
            Radial dots pattern background
          </p>
        </div>
      </div>
    </div>
  ),
};

export const Gradient: Story = {
  args: {
    variant: 'gradient',
  },
  render: args => (
    <div className='relative h-96 w-full'>
      <BackgroundPattern {...args} />
      <div className='relative z-10 flex items-center justify-center h-full'>
        <div className='text-center'>
          <h2 className='text-2xl font-bold text-gray-900 dark:text-white mb-2'>
            Gradient Pattern
          </h2>
          <p className='text-gray-600 dark:text-gray-400'>
            Beautiful gradient background
          </p>
        </div>
      </div>
    </div>
  ),
};

export const InDarkMode: Story = {
  args: {
    variant: 'grid',
  },
  parameters: {
    backgrounds: { default: 'dark' },
  },
  render: args => (
    <div className='relative h-96 w-full'>
      <BackgroundPattern {...args} />
      <div className='relative z-10 flex items-center justify-center h-full'>
        <div className='text-center'>
          <h2 className='text-2xl font-bold text-gray-900 dark:text-white mb-2'>
            Dark Mode Grid
          </h2>
          <p className='text-gray-600 dark:text-gray-400'>
            Grid pattern in dark mode
          </p>
        </div>
      </div>
    </div>
  ),
};

export const LayeredPatterns: Story = {
  render: () => (
    <div className='relative h-96 w-full'>
      <BackgroundPattern variant='gradient' />
      <BackgroundPattern variant='grid' className='opacity-50' />
      <div className='relative z-10 flex items-center justify-center h-full'>
        <div className='text-center bg-white/60 dark:bg-gray-900/60 backdrop-blur-md rounded-lg p-6'>
          <h2 className='text-2xl font-bold text-gray-900 dark:text-white mb-2'>
            Layered Patterns
          </h2>
          <p className='text-gray-600 dark:text-gray-400'>
            Gradient with overlaid grid pattern
          </p>
        </div>
      </div>
    </div>
  ),
};
