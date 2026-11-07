import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useState } from 'react';
import { BUTTON_SIZE_NAMES, BUTTON_VARIANT_NAMES, Button } from './button';
import type { ButtonActionState } from './button-contract';

const meta: Meta<typeof Button> = {
  title: 'shadcn/Button',
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
      options: [...BUTTON_VARIANT_NAMES],
      description: 'Visual style variant',
    },
    size: {
      control: { type: 'select' },
      options: [...BUTTON_SIZE_NAMES],
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

function PillStateFixture() {
  const [state, setState] = useState<ButtonActionState>('idle');
  return (
    <div className='grid w-full gap-6 p-6' data-testid='morph-fixture'>
      <div className='flex items-center gap-4'>
        <Button
          pendingPresentation='morph'
          actionState={state}
          onClick={() => setState('pending')}
        >
          Save changes
        </Button>
        <span data-testid='morph-sibling'>Reserved neighbor</span>
      </div>
      <Button
        pendingPresentation='morph'
        actionState={state}
        className='w-full'
        onClick={() => setState('pending')}
      >
        Save this very long profile description and all of my changes
      </Button>
      <div className='flex flex-wrap gap-4'>
        <Button variant='secondary' onClick={() => setState('error')}>
          Reject request
        </Button>
        <Button variant='secondary' onClick={() => setState('idle')}>
          Reset request
        </Button>
        <Button variant='secondary' onClick={() => setState('success')}>
          Resolve request
        </Button>
      </div>
    </div>
  );
}

/** Manual completion controls are fixture inputs, never simulated product progress. */
export const PillStateChoreography: Story = {
  render: () => <PillStateFixture />,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        story:
          'pill-state-continuity: label fades with duration-fast; round caps converge with duration-subtle / ease-in-out. Fixed slot and 44px target; real caller state owns completion. Keyboard and reduced motion substitute immediately. Resolve/reject/reset interrupt the transition.',
      },
    },
  },
};

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
    'aria-label': 'Add',
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

export const FocusVisible: Story = {
  args: {
    children: 'Focus visible',
    variant: 'primary',
    size: 'lg',
    autoFocus: true,
  },
  parameters: {
    docs: {
      description: {
        story:
          'Keyboard focus-visible spec: canonical ring-2 focus ring with page-colored offset on the primary/lg master selection.',
      },
    },
  },
};

export const ActionStateMatrix: Story = {
  render: () => (
    <div className='grid gap-4 p-6'>
      {BUTTON_VARIANT_NAMES.filter(variant => variant !== 'link').map(
        variant => (
          <div className='flex flex-wrap items-center gap-3' key={variant}>
            <span className='w-20 text-xs text-tertiary-token'>{variant}</span>
            <Button variant={variant}>Idle</Button>
            <Button variant={variant} loading>
              Loading
            </Button>
            <Button
              variant={variant}
              pendingPresentation='morph'
              actionState='pending'
            >
              Pending
            </Button>
            <Button
              variant={variant}
              pendingPresentation='morph'
              actionState='success'
            >
              Complete
            </Button>
            <Button
              variant={variant}
              pendingPresentation='morph'
              actionState='error'
            >
              Retry action
            </Button>
            <Button variant={variant} disabled>
              Disabled
            </Button>
            <Button variant={variant} destructive>
              Destructive
            </Button>
          </div>
        )
      )}
    </div>
  ),
  parameters: { layout: 'padded' },
};

// Production-backed primary/lg fixtures (Pen master button/primary/lg/idle)
export const ProductionPrimaryLgFixtures: Story = {
  render: () => (
    <div className='flex flex-col gap-4 p-8'>
      <div>
        <h3 className='text-sm font-semibold mb-2'>
          /download — label override (icon composed in source)
        </h3>
        <Button variant='primary' size='lg' className='gap-2 px-6'>
          <svg
            className='size-4'
            fill='none'
            stroke='currentColor'
            viewBox='0 0 24 24'
            aria-hidden='true'
          >
            <path
              strokeLinecap='round'
              strokeLinejoin='round'
              strokeWidth={2}
              d='M12 3v12m0 0 4-4m-4 4-4-4M4 21h16'
            />
          </svg>
          Download for Mac
        </Button>
      </div>
      <div>
        <h3 className='text-sm font-semibold mb-2'>
          Footer / final CTA — label override
        </h3>
        <Button variant='primary' size='lg'>
          Get started
        </Button>
      </div>
    </div>
  ),
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        story:
          'Exact production-backed primary/lg selections that resolve to the same Pen master (button/primary/lg/idle) with independent label overrides. The /download leading icon is source-composed child content: live Pen readback shows the master exposes no leading-icon slot, so icon overrides fail closed.',
      },
    },
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
          <Button size='icon' aria-label='Add'>
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
