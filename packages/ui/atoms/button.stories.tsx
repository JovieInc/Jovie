import type { Meta, StoryObj } from '@storybook/react';
import { ArrowRight, Download, Heart, Plus, Search, X } from 'lucide-react';
import Link from 'next/link';

import { Button } from './button';

const meta: Meta<typeof Button> = {
  title: 'UI/Button',
  component: Button,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: `
A versatile button component built with shadcn/ui primitives and Tailwind v4. 
Supports multiple variants, sizes, loading states, and accessibility features.

## Key Features
- **SSR/RSC Safe**: No client-side dependencies
- **Apple-level Polish**: Focus rings, motion-reduced animations
- **Full Accessibility**: ARIA support, keyboard navigation, screen reader friendly
- **Icon Support**: Built-in gap spacing and size constraints
- **asChild Pattern**: Use with Next.js Link and other components
        `,
      },
    },
  },
  argTypes: {
    variant: {
      control: 'select',
      options: [
        'primary',
        'destructive',
        'outline',
        'secondary',
        'ghost',
        'link',
      ],
      description: 'Visual style variant',
    },
    size: {
      control: 'select',
      options: ['default', 'sm', 'lg', 'icon'],
      description: 'Button size variant',
    },
    loading: {
      control: 'boolean',
      description: 'Show loading spinner and disable interaction',
    },
    disabled: {
      control: 'boolean',
      description: 'Disable the button',
    },
    asChild: {
      control: 'boolean',
      description: 'Render as child component (e.g., Link)',
    },
    children: {
      control: 'text',
      description: 'Button content',
    },
    'aria-label': {
      control: 'text',
      description: 'Accessible label for icon-only buttons',
    },
  },
  args: {
    onClick: () => console.log('Button clicked'),
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

// Basic variants
export const Primary: Story = {
  args: {
    children: 'Primary Button',
    variant: 'primary',
  },
};

export const Destructive: Story = {
  args: {
    children: 'Delete Account',
    variant: 'destructive',
  },
};

export const Outline: Story = {
  args: {
    children: 'Outline Button',
    variant: 'outline',
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

export const Link: Story = {
  args: {
    children: 'Link Button',
    variant: 'link',
  },
};

// Sizes
export const Sizes: Story = {
  render: () => (
    <div className='flex items-center gap-4'>
      <Button size='sm'>Small</Button>
      <Button size='default'>Default</Button>
      <Button size='lg'>Large</Button>
    </div>
  ),
};

// Icon-only buttons
export const IconOnly: Story = {
  render: () => (
    <div className='flex items-center gap-2'>
      <Button size='icon' aria-label='Search'>
        <Search />
      </Button>
      <Button size='icon' variant='outline' aria-label='Add item'>
        <Plus />
      </Button>
      <Button size='icon' variant='destructive' aria-label='Close dialog'>
        <X />
      </Button>
      <Button size='icon' variant='ghost' aria-label='Like'>
        <Heart />
      </Button>
    </div>
  ),
};

// Buttons with icons
export const WithIcons: Story = {
  render: () => (
    <div className='flex flex-col gap-4'>
      <div className='flex items-center gap-2'>
        <Button>
          <Download />
          Download
        </Button>
        <Button variant='outline'>
          Continue
          <ArrowRight />
        </Button>
      </div>
      <div className='flex items-center gap-2'>
        <Button size='sm'>
          <Plus />
          Add New
        </Button>
        <Button size='lg' variant='secondary'>
          <Search />
          Search Files
        </Button>
      </div>
    </div>
  ),
};

// Loading states
export const LoadingStates: Story = {
  render: () => (
    <div className='flex items-center gap-2'>
      <Button loading>Saving...</Button>
      <Button loading variant='outline'>
        Processing...
      </Button>
      <Button loading size='icon' aria-label='Loading'>
        <Heart />
      </Button>
    </div>
  ),
};

// Disabled states
export const DisabledStates: Story = {
  render: () => (
    <div className='flex items-center gap-2'>
      <Button disabled>Disabled</Button>
      <Button disabled variant='outline'>
        Disabled Outline
      </Button>
      <Button disabled variant='destructive'>
        Disabled Destructive
      </Button>
    </div>
  ),
};

// asChild with Next.js Link
export const AsChildLink: Story = {
  render: () => (
    <div className='flex flex-col gap-4'>
      <Button asChild>
        <Link href='/dashboard'>Go to Dashboard</Link>
      </Button>
      <Button asChild variant='outline'>
        <Link href='/profile'>
          <ArrowRight />
          View Profile
        </Link>
      </Button>
      <Button asChild size='icon' aria-label='External link'>
        <a href='https://example.com' target='_blank' rel='noopener noreferrer'>
          <ArrowRight />
        </a>
      </Button>
    </div>
  ),
};

// Interactive playground
export const Playground: Story = {
  args: {
    children: 'Click me',
    variant: 'primary',
    size: 'default',
    loading: false,
    disabled: false,
  },
};

// All variants showcase
export const AllVariants: Story = {
  render: () => (
    <div className='grid grid-cols-3 gap-4 p-4'>
      <div className='space-y-2'>
        <h3 className='text-sm font-medium'>Primary</h3>
        <Button variant='primary'>Primary</Button>
        <Button variant='primary' size='sm'>
          Small
        </Button>
        <Button variant='primary' size='lg'>
          Large
        </Button>
        <Button variant='primary' size='icon' aria-label='Primary icon'>
          <Heart />
        </Button>
      </div>

      <div className='space-y-2'>
        <h3 className='text-sm font-medium'>Outline</h3>
        <Button variant='outline'>Outline</Button>
        <Button variant='outline' size='sm'>
          Small
        </Button>
        <Button variant='outline' size='lg'>
          Large
        </Button>
        <Button variant='outline' size='icon' aria-label='Outline icon'>
          <Search />
        </Button>
      </div>

      <div className='space-y-2'>
        <h3 className='text-sm font-medium'>Destructive</h3>
        <Button variant='destructive'>Destructive</Button>
        <Button variant='destructive' size='sm'>
          Small
        </Button>
        <Button variant='destructive' size='lg'>
          Large
        </Button>
        <Button variant='destructive' size='icon' aria-label='Delete'>
          <X />
        </Button>
      </div>

      <div className='space-y-2'>
        <h3 className='text-sm font-medium'>Secondary</h3>
        <Button variant='secondary'>Secondary</Button>
        <Button variant='secondary' size='sm'>
          Small
        </Button>
        <Button variant='secondary' size='lg'>
          Large
        </Button>
        <Button variant='secondary' size='icon' aria-label='Secondary icon'>
          <Plus />
        </Button>
      </div>

      <div className='space-y-2'>
        <h3 className='text-sm font-medium'>Ghost</h3>
        <Button variant='ghost'>Ghost</Button>
        <Button variant='ghost' size='sm'>
          Small
        </Button>
        <Button variant='ghost' size='lg'>
          Large
        </Button>
        <Button variant='ghost' size='icon' aria-label='Ghost icon'>
          <Download />
        </Button>
      </div>

      <div className='space-y-2'>
        <h3 className='text-sm font-medium'>Link</h3>
        <Button variant='link'>Link</Button>
        <Button variant='link' size='sm'>
          Small
        </Button>
        <Button variant='link' size='lg'>
          Large
        </Button>
      </div>
    </div>
  ),
};
