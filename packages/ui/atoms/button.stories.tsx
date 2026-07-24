import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Button } from './button';

const meta: Meta<typeof Button> = {
  title: 'UI/Atoms/Button',
  component: Button,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Canonical Button component with five variants, three sizes, destructive tone, loading states, and Radix Slot composition.',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: { type: 'select' },
      options: ['primary', 'secondary', 'tertiary', 'ghost', 'link'],
      description: 'Visual style variant',
    },
    size: {
      control: { type: 'select' },
      options: ['sm', 'md', 'lg', 'icon'],
      description: 'Button size',
    },
    destructive: {
      control: { type: 'boolean' },
      description: 'Apply destructive tone to the selected variant',
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

export const Secondary: Story = {
  args: {
    children: 'Secondary Button',
    variant: 'secondary',
  },
};

export const Tertiary: Story = {
  args: {
    children: 'Tertiary Button',
    variant: 'tertiary',
  },
};

export const Ghost: Story = {
  args: {
    children: 'Ghost Button',
    variant: 'ghost',
  },
};

export const Destructive: Story = {
  args: {
    children: 'Delete',
    variant: 'primary',
    destructive: true,
  },
};

export const Link: Story = {
  args: {
    children: 'Link Button',
    variant: 'link',
  },
};

// Sizes
export const Small: Story = {
  args: {
    children: 'Small Button',
    size: 'sm',
  },
};

export const Medium: Story = {
  args: {
    children: 'Medium Button',
    size: 'md',
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

export const DisabledVisual: Story = {
  args: {
    children: 'Disabled visual spec',
    disabled: true,
    variant: 'primary',
  },
  parameters: {
    docs: {
      description: {
        story:
          'Disabled-visual spec: data-state="disabled", --state-disabled-opacity, and --color-text-disabled-token.',
      },
    },
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
          <Button variant='secondary'>Secondary</Button>
          <Button variant='tertiary'>Tertiary</Button>
          <Button variant='ghost'>Ghost</Button>
          <Button variant='link'>Link</Button>
        </div>
      </div>

      <div>
        <h3 className='text-sm font-semibold mb-2'>Destructive Tone</h3>
        <div className='flex gap-2 flex-wrap'>
          <Button variant='primary' destructive>
            Primary
          </Button>
          <Button variant='secondary' destructive>
            Secondary
          </Button>
          <Button variant='tertiary' destructive>
            Tertiary
          </Button>
          <Button variant='ghost' destructive>
            Ghost
          </Button>
          <Button variant='link' destructive>
            Link
          </Button>
        </div>
      </div>

      <div>
        <h3 className='text-sm font-semibold mb-2'>Sizes</h3>
        <div className='flex gap-2 items-center flex-wrap'>
          <Button size='sm'>Small</Button>
          <Button size='md'>Medium</Button>
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
