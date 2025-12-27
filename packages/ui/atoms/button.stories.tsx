import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Button } from './button';

const meta: Meta<typeof Button> = {
  title: 'shadcn/Button',
  component: Button,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Primary button component with comprehensive variants, loading states, and full accessibility support. Built on Radix UI Slot primitive for flexible composition.',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: { type: 'select' },
      options: [
        'primary',
        'accent',
        'secondary',
        'ghost',
        'outline',
        'destructive',
        'link',
        'frosted',
        'frosted-ghost',
        'frosted-outline',
      ],
      description: 'Visual style variant',
    },
    size: {
      control: { type: 'select' },
      options: ['default', 'sm', 'lg', 'icon'],
      description: 'Button size',
    },
    loading: {
      control: { type: 'boolean' },
      description: 'Show loading spinner',
    },
    disabled: {
      control: { type: 'boolean' },
      description: 'Disabled state',
    },
    asChild: {
      control: { type: 'boolean' },
      description: 'Render as child element (Radix Slot)',
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

// Core Variants
export const Primary: Story = {
  args: {
    children: 'Primary Button',
    variant: 'primary',
  },
};

export const Accent: Story = {
  args: {
    children: 'Accent Button',
    variant: 'accent',
  },
};

export const Secondary: Story = {
  args: {
    children: 'Secondary Button',
    variant: 'secondary',
  },
};

export const Ghost: Story = {
  args: {
    children: 'Ghost Button',
    variant: 'ghost',
  },
};

export const Outline: Story = {
  args: {
    children: 'Outline Button',
    variant: 'outline',
  },
};

export const Destructive: Story = {
  args: {
    children: 'Delete',
    variant: 'destructive',
  },
};

export const Link: Story = {
  args: {
    children: 'Link Button',
    variant: 'link',
  },
};

// Frosted Glass Variants
export const Frosted: Story = {
  args: {
    children: 'Frosted Button',
    variant: 'frosted',
  },
  parameters: {
    backgrounds: { default: 'dark' },
  },
};

export const FrostedGhost: Story = {
  args: {
    children: 'Frosted Ghost',
    variant: 'frosted-ghost',
  },
  parameters: {
    backgrounds: { default: 'dark' },
  },
};

export const FrostedOutline: Story = {
  args: {
    children: 'Frosted Outline',
    variant: 'frosted-outline',
  },
  parameters: {
    backgrounds: { default: 'dark' },
  },
};

// Sizes
export const Small: Story = {
  args: {
    children: 'Small Button',
    size: 'sm',
  },
};

export const Default: Story = {
  args: {
    children: 'Default Button',
    size: 'default',
  },
};

export const Large: Story = {
  args: {
    children: 'Large Button',
    size: 'lg',
  },
};

export const Icon: Story = {
  args: {
    size: 'icon',
    children: (
      <svg
        className='h-4 w-4'
        fill='none'
        stroke='currentColor'
        viewBox='0 0 24 24'
        aria-hidden='true'
      >
        <path
          strokeLinecap='round'
          strokeLinejoin='round'
          strokeWidth={2}
          d='M12 4v16m8-8H4'
        />
      </svg>
    ),
  },
};

// States
export const Loading: Story = {
  args: {
    children: 'Loading...',
    loading: true,
  },
};

export const Disabled: Story = {
  args: {
    children: 'Disabled Button',
    disabled: true,
  },
};

export const LoadingDisabled: Story = {
  args: {
    children: 'Loading Disabled',
    loading: true,
    disabled: true,
  },
};

// Composition Examples
export const WithIcon: Story = {
  args: {
    children: (
      <>
        <svg
          className='h-4 w-4 mr-2'
          fill='none'
          stroke='currentColor'
          viewBox='0 0 24 24'
          aria-hidden='true'
        >
          <path
            strokeLinecap='round'
            strokeLinejoin='round'
            strokeWidth={2}
            d='M12 4v16m8-8H4'
          />
        </svg>
        Add Item
      </>
    ),
  },
};

export const FullWidth: Story = {
  args: {
    children: 'Full Width Button',
    className: 'w-full',
  },
  parameters: {
    layout: 'padded',
  },
};

// Dark Mode Preview
export const DarkMode: Story = {
  args: {
    children: 'Button in Dark Mode',
    variant: 'primary',
  },
  parameters: {
    backgrounds: { default: 'dark' },
  },
};

// All Variants Grid
export const AllVariants: Story = {
  render: () => (
    <div className='flex flex-col gap-4 p-8'>
      <div>
        <h3 className='text-sm font-semibold mb-2'>Core Variants</h3>
        <div className='flex gap-2 flex-wrap'>
          <Button variant='primary'>Primary</Button>
          <Button variant='accent'>Accent</Button>
          <Button variant='secondary'>Secondary</Button>
          <Button variant='ghost'>Ghost</Button>
          <Button variant='outline'>Outline</Button>
          <Button variant='destructive'>Destructive</Button>
          <Button variant='link'>Link</Button>
        </div>
      </div>

      <div>
        <h3 className='text-sm font-semibold mb-2'>Frosted Variants</h3>
        <div className='flex gap-2 flex-wrap'>
          <Button variant='frosted'>Frosted</Button>
          <Button variant='frosted-ghost'>Frosted Ghost</Button>
          <Button variant='frosted-outline'>Frosted Outline</Button>
        </div>
      </div>

      <div>
        <h3 className='text-sm font-semibold mb-2'>Sizes</h3>
        <div className='flex gap-2 items-center flex-wrap'>
          <Button size='sm'>Small</Button>
          <Button size='default'>Default</Button>
          <Button size='lg'>Large</Button>
          <Button size='icon'>
            <svg
              className='h-4 w-4'
              fill='none'
              stroke='currentColor'
              viewBox='0 0 24 24'
              aria-hidden='true'
            >
              <path
                strokeLinecap='round'
                strokeLinejoin='round'
                strokeWidth={2}
                d='M12 4v16m8-8H4'
              />
            </svg>
          </Button>
        </div>
      </div>

      <div>
        <h3 className='text-sm font-semibold mb-2'>States</h3>
        <div className='flex gap-2 flex-wrap'>
          <Button loading>Loading</Button>
          <Button disabled>Disabled</Button>
          <Button loading disabled>
            Loading Disabled
          </Button>
        </div>
      </div>
    </div>
  ),
  parameters: {
    layout: 'fullscreen',
  },
};
