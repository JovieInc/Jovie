import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { BrandLogo } from './BrandLogo';

const meta: Meta<typeof BrandLogo> = {
  title: 'Atoms/BrandLogo',
  component: BrandLogo,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'The Jovie brand logo with support for different tones and sizes.',
      },
    },
  },
  argTypes: {
    size: {
      control: { type: 'range', min: 16, max: 128, step: 8 },
      description: 'Size of the logo in pixels',
    },
    tone: {
      control: 'select',
      options: ['auto', 'black', 'white', 'color'],
      description: 'Color tone of the logo',
    },
    rounded: {
      control: 'boolean',
      description: 'Whether to apply rounded corners',
    },
  },
};

export default meta;
type Story = StoryObj<typeof BrandLogo>;

export const Default: Story = {
  args: {
    size: 48,
    tone: 'auto',
  },
};

export const Small: Story = {
  args: {
    size: 24,
    tone: 'auto',
  },
};

export const Large: Story = {
  args: {
    size: 96,
    tone: 'auto',
  },
};

export const Black: Story = {
  args: {
    size: 48,
    tone: 'black',
  },
  parameters: {
    backgrounds: { default: 'light' },
  },
};

export const White: Story = {
  args: {
    size: 48,
    tone: 'white',
  },
  parameters: {
    backgrounds: { default: 'dark' },
  },
  decorators: [
    Story => (
      <div className='bg-black p-4'>
        <Story />
      </div>
    ),
  ],
};

export const Color: Story = {
  args: {
    size: 48,
    tone: 'color',
  },
};

export const NotRounded: Story = {
  args: {
    size: 48,
    tone: 'auto',
    rounded: false,
  },
};

export const AllSizes: Story = {
  render: () => (
    <div className='flex items-end gap-4'>
      {[16, 24, 32, 48, 64, 96].map(size => (
        <div key={size} className='flex flex-col items-center gap-2'>
          <BrandLogo size={size} />
          <span className='text-xs text-secondary-token'>{size}px</span>
        </div>
      ))}
    </div>
  ),
};

export const AllTones: Story = {
  render: () => (
    <div className='flex gap-8'>
      <div className='flex flex-col items-center gap-2 rounded-lg bg-white p-4'>
        <BrandLogo size={48} tone='black' />
        <span className='text-xs text-black'>Black</span>
      </div>
      <div className='flex flex-col items-center gap-2 rounded-lg bg-black p-4'>
        <BrandLogo size={48} tone='white' />
        <span className='text-xs text-white'>White</span>
      </div>
      <div className='flex flex-col items-center gap-2 rounded-lg bg-surface-2 p-4'>
        <BrandLogo size={48} tone='color' />
        <span className='text-xs text-secondary-token'>Color</span>
      </div>
      <div className='flex flex-col items-center gap-2 rounded-lg bg-surface-2 p-4'>
        <BrandLogo size={48} tone='auto' />
        <span className='text-xs text-secondary-token'>Auto</span>
      </div>
    </div>
  ),
};
