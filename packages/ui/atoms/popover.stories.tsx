import { Button } from '@jovie/ui/atoms/button';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import * as React from 'react';
import { Popover, PopoverContent, PopoverTrigger } from './popover';

const meta: Meta<typeof Popover> = {
  title: 'UI/Atoms/Popover',
  component: Popover,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'A popover is a non-modal dialog that floats around its trigger. Use for supplementary content, forms, or additional actions without leaving the current context.',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    open: {
      control: { type: 'boolean' },
      description: 'Controls the open state of the popover',
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

// Simple popover example
export const Default: Story = {
  render: () => (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant='outline'>Open popover</Button>
      </PopoverTrigger>
      <PopoverContent>
        <div className='space-y-2'>
          <h4 className='font-medium leading-none'>Dimensions</h4>
          <p className='text-sm text-secondary-token'>
            Set the dimensions for the layer.
          </p>
        </div>
      </PopoverContent>
    </Popover>
  ),
};

// Popover with form content
export const WithForm: Story = {
  render: () => (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant='outline'>Settings</Button>
      </PopoverTrigger>
      <PopoverContent className='w-80'>
        <div className='space-y-4'>
          <div className='space-y-2'>
            <h4 className='font-medium leading-none'>Account Settings</h4>
            <p className='text-sm text-secondary-token'>
              Update your account preferences.
            </p>
          </div>
          <div className='space-y-3'>
            <div className='space-y-1'>
              <label className='text-sm font-medium' htmlFor='email'>
                Email
              </label>
              <input
                id='email'
                type='email'
                placeholder='Enter your email'
                className='w-full px-3 py-2 text-sm border border-subtle rounded-md bg-surface-0 focus-visible:ring-2 focus-visible:ring-accent focus-visible:border-transparent'
              />
            </div>
            <div className='space-y-1'>
              <label className='text-sm font-medium' htmlFor='notifications'>
                Notifications
              </label>
              <div className='flex items-center space-x-2'>
                <input
                  id='notifications'
                  type='checkbox'
                  className='rounded border-subtle'
                />
                <span className='text-sm'>Enable email notifications</span>
              </div>
            </div>
            <div className='flex gap-2 pt-2'>
              <Button size='sm'>Save</Button>
              <Button variant='outline' size='sm'>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  ),
};

// Popover with interactive content
export const WithInteractiveContent: Story = {
  render: () => (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant='outline'>Share</Button>
      </PopoverTrigger>
      <PopoverContent className='w-64'>
        <div className='space-y-3'>
          <h4 className='font-medium leading-none'>Share this item</h4>
          <div className='space-y-2'>
            <Button variant='ghost' className='w-full justify-start h-8 px-2'>
              <span className='mr-2'>📧</span>
              Email
            </Button>
            <Button variant='ghost' className='w-full justify-start h-8 px-2'>
              <span className='mr-2'>🔗</span>
              Copy link
            </Button>
            <Button variant='ghost' className='w-full justify-start h-8 px-2'>
              <span className='mr-2'>📱</span>
              Social media
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  ),
};

// Popover with arrow
export const WithArrow: Story = {
  render: () => (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant='outline'>With arrow</Button>
      </PopoverTrigger>
      <PopoverContent showArrow className='w-56'>
        <div className='space-y-2'>
          <h4 className='font-medium'>Tooltip-style popover</h4>
          <p className='text-sm text-secondary-token'>
            This popover includes an arrow pointing to the trigger.
          </p>
        </div>
      </PopoverContent>
    </Popover>
  ),
};

// Different positions
export const Positions: Story = {
  render: () => (
    <div className='grid grid-cols-2 gap-4 p-8'>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant='outline'>Top</Button>
        </PopoverTrigger>
        <PopoverContent side='top' align='center'>
          <div className='text-sm'>
            <p>Popover positioned above the trigger</p>
          </div>
        </PopoverContent>
      </Popover>

      <Popover>
        <PopoverTrigger asChild>
          <Button variant='outline'>Bottom</Button>
        </PopoverTrigger>
        <PopoverContent side='bottom' align='center'>
          <div className='text-sm'>
            <p>Popover positioned below the trigger</p>
          </div>
        </PopoverContent>
      </Popover>

      <Popover>
        <PopoverTrigger asChild>
          <Button variant='outline'>Left</Button>
        </PopoverTrigger>
        <PopoverContent side='left' align='center'>
          <div className='text-sm'>
            <p>Popover positioned to the left</p>
          </div>
        </PopoverContent>
      </Popover>

      <Popover>
        <PopoverTrigger asChild>
          <Button variant='outline'>Right</Button>
        </PopoverTrigger>
        <PopoverContent side='right' align='center'>
          <div className='text-sm'>
            <p>Popover positioned to the right</p>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  ),
  parameters: {
    layout: 'fullscreen',
  },
};

// Controlled state example
export const Controlled: Story = {
  render: function ControlledStory() {
    const [open, setOpen] = React.useState(false);

    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant='outline'>
            {open ? 'Close' : 'Open'} controlled popover
          </Button>
        </PopoverTrigger>
        <PopoverContent>
          <div className='space-y-2'>
            <h4 className='font-medium'>Controlled Popover</h4>
            <p className='text-sm text-secondary-token'>
              This popover&apos;s state is controlled externally.
            </p>
            <Button size='sm' onClick={() => setOpen(false)} className='w-full'>
              Close
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    );
  },
};

// Dark mode demonstration
export const DarkMode: Story = {
  render: () => (
    <div className='dark bg-surface-0 p-8 rounded-lg'>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant='outline'>Dark mode popover</Button>
        </PopoverTrigger>
        <PopoverContent>
          <div className='space-y-2'>
            <h4 className='font-medium'>Dark Mode</h4>
            <p className='text-sm text-secondary-token'>
              This popover demonstrates dark mode styling with proper contrast
              and readability.
            </p>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  ),
  parameters: {
    backgrounds: {
      default: 'dark',
    },
  },
};
