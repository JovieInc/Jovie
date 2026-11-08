import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { RefreshCw, Share2 } from 'lucide-react';
import { Button } from './button';
import { Kbd } from './kbd';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from './tooltip';

const meta: Meta<typeof Tooltip> = {
  title: 'UI/Atoms/Tooltip States',
  component: Tooltip,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'A Linear-style tooltip with tokenized surface styling for consistent contrast. Features sensible delays, pointer safety, reduced motion support, and an optional arrow (hidden by default).',
      },
    },
  },
  decorators: [
    Story => (
      <TooltipProvider>
        <div className='p-8'>
          <Story />
        </div>
      </TooltipProvider>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof Tooltip>;

/**
 * Basic tooltip with default settings
 */

/**
 * Error state: a failed sync explained on its retry control with the danger tone.
 */
export const ErrorState: Story = {
  render: () => (
    <Tooltip defaultOpen>
      <TooltipTrigger>
        <Button variant='secondary' destructive>
          <RefreshCw className='size-4' aria-hidden='true' />
          Retry sync
        </Button>
      </TooltipTrigger>
      <TooltipContent tone='danger' side='bottom'>
        Spotify sync failed. Retry to fetch the latest releases.
      </TooltipContent>
    </Tooltip>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Failure explanation on a retry trigger, using the shared error tokens through tone="danger".',
      },
    },
  },
};

/**
 * Right-to-left content: Arabic label with a shortcut keycap.
 */
export const Rtl: Story = {
  render: () => (
    <div dir='rtl'>
      <Tooltip defaultOpen>
        <TooltipTrigger>
          <Button
            variant='secondary'
            size='icon'
            aria-label='مشاركة الملف الشخصي'
          >
            <Share2 className='size-4' aria-hidden='true' />
          </Button>
        </TooltipTrigger>
        <TooltipContent dir='rtl' side='bottom'>
          <span className='min-w-0'>
            انسخ رابط الملف الشخصي العام لمشاركته في أي مكان
          </span>
          <Kbd variant='tooltip' className='shrink-0'>
            ⌘C
          </Kbd>
        </TooltipContent>
      </Tooltip>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Portalled content does not inherit the trigger direction, so it carries dir="rtl" itself; Arabic text wraps within the 14rem surface with the keycap at the inline end.',
      },
    },
  },
};
