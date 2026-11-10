import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ArrowLeft, Lock, Send } from 'lucide-react';
import { BUTTON_SIZE_NAMES, BUTTON_VARIANT_NAMES, Button } from './button';

const meta: Meta<typeof Button> = {
  title: 'shadcn/Button States',
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

/** Manual completion controls are fixture inputs, never simulated product progress. */

// Certificate states

export const ErrorState: Story = {
  args: {
    children: 'Save release',
    pendingPresentation: 'morph',
    actionState: 'error',
    stateLabels: {
      error: 'Could not save the release.',
      retry: 'Retry save',
    },
  },
  parameters: {
    docs: {
      description: {
        story:
          'Failed action: the morph presentation swaps the face to the retry label and announces the error through its polite status region.',
      },
    },
  },
};

export const PartialStateLabels: Story = {
  args: {
    children: 'Publish',
    pendingPresentation: 'morph',
    actionState: 'error',
    stateLabels: { retry: 'Try again' },
  },
  parameters: {
    docs: {
      description: {
        story:
          'Only some state labels supplied: the custom retry label is used and the missing error message falls back to the default copy.',
      },
    },
  },
};

export const LongContent: Story = {
  render: () => (
    <div className='w-56'>
      <Button variant='secondary' className='max-w-full'>
        Save this very long profile description and all of my changes
      </Button>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'A long label in a narrow container wraps inside the pill; the face grows in height and the hit target grows with it.',
      },
    },
  },
};

export const PermissionDenied: Story = {
  render: () => (
    <div className='flex w-64 flex-col items-start gap-2'>
      <Button disabled aria-describedby='button-permission-note'>
        <Lock className='size-4' aria-hidden='true' />
        Publish release
      </Button>
      <p id='button-permission-note' className='text-xs text-secondary-token'>
        Only label admins can publish releases.
      </p>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Action the viewer is not allowed to take: the real disabled state, with the reason linked through aria-describedby.',
      },
    },
  },
};

export const Rtl: Story = {
  render: () => (
    <div dir='rtl' className='flex w-64 flex-wrap items-center gap-2'>
      <Button>
        <Send className='size-4' aria-hidden='true' />
        إرسال الإصدار
      </Button>
      <Button variant='secondary'>
        <ArrowLeft className='size-4 rtl:rotate-180' aria-hidden='true' />
        رجوع إلى جميع الإصدارات
      </Button>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Right-to-left labels keep the icon at the inline start and wrap within the container instead of overflowing it.',
      },
    },
  },
};
