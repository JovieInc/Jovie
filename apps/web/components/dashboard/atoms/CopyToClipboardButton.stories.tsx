import { Button } from '@jovie/ui';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Icon } from '@/components/atoms/Icon';
import { CopyToClipboardButton } from './CopyToClipboardButton';

const meta: Meta<typeof CopyToClipboardButton> = {
  title: 'Dashboard/Atoms/CopyToClipboardButton',
  component: CopyToClipboardButton,
  parameters: {
    layout: 'centered',
  },
};

export default meta;
type Story = StoryObj<typeof CopyToClipboardButton>;

export const Default: Story = {
  args: {
    relativePath: '/johndoe',
  },
};

export const CustomLabels: Story = {
  args: {
    relativePath: '/artist-profile',
    idleLabel: 'Share Profile',
    successLabel: 'Link Copied!',
    errorLabel: 'Copy Failed',
  },
};

export const ShortPath: Story = {
  args: {
    relativePath: '/jd',
    idleLabel: 'Copy Link',
  },
};

export const InContext: Story = {
  render: () => (
    <div className='p-4 border border-subtle rounded-lg bg-surface space-y-3 w-80'>
      <div className='flex items-center justify-between'>
        <div>
          <p className='text-sm font-medium'>Your Profile URL</p>
          <p className='text-xs text-secondary'>jov.ie/johndoe</p>
        </div>
        <CopyToClipboardButton relativePath='/johndoe' />
      </div>
    </div>
  ),
};

/**
 * Demonstrates the success state visual feedback.
 * Click the button to see the state transition live, or view the static display below.
 */
export const SuccessState: Story = {
  render: () => (
    <div className='space-y-6'>
      <div>
        <p className='text-sm font-medium mb-2'>
          Interactive (click to see transition):
        </p>
        <CopyToClipboardButton relativePath='/johndoe' />
      </div>
      <div>
        <p className='text-sm font-medium mb-2'>Success state appearance:</p>
        <div className='relative'>
          <Button
            variant='secondary'
            size='sm'
            className='transition-colors duration-200 bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 dark:text-emerald-200'
            data-status='success'
          >
            ✓ Copied!
          </Button>
        </div>
      </div>
    </div>
  ),
};

/**
 * Demonstrates the error state visual feedback.
 * This state appears when the clipboard copy fails.
 */
export const ErrorState: Story = {
  render: () => (
    <div className='space-y-6'>
      <div>
        <p className='text-sm font-medium mb-2'>Error state appearance:</p>
        <div className='relative'>
          <Button
            variant='secondary'
            size='sm'
            className='transition-colors duration-200 bg-red-500/10 text-red-600 hover:bg-red-500/20 dark:text-red-200'
            data-status='error'
          >
            Failed to copy
          </Button>
        </div>
      </div>
    </div>
  ),
};

/**
 * Shows all visual states side-by-side for comparison.
 * Demonstrates the visual feedback progression from idle → success/error → idle.
 */
export const AllStates: Story = {
  render: () => (
    <div className='space-y-6'>
      <div className='flex items-center gap-4'>
        <div className='text-center'>
          <p className='text-xs text-secondary mb-2'>Idle</p>
          <Button
            variant='secondary'
            size='sm'
            className='transition-colors duration-200'
            data-status='idle'
          >
            Copy URL
          </Button>
        </div>
        <div className='text-secondary'>→</div>
        <div className='text-center'>
          <p className='text-xs text-secondary mb-2'>Success</p>
          <Button
            variant='secondary'
            size='sm'
            className='transition-colors duration-200 bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 dark:text-emerald-200'
            data-status='success'
          >
            ✓ Copied!
          </Button>
        </div>
        <div className='text-secondary'>→</div>
        <div className='text-center'>
          <p className='text-xs text-secondary mb-2'>Idle (after 2s)</p>
          <Button
            variant='secondary'
            size='sm'
            className='transition-colors duration-200'
            data-status='idle'
          >
            Copy URL
          </Button>
        </div>
      </div>
      <div className='flex items-center gap-4'>
        <div className='text-center'>
          <p className='text-xs text-secondary mb-2'>Idle</p>
          <Button
            variant='secondary'
            size='sm'
            className='transition-colors duration-200'
            data-status='idle'
          >
            Copy URL
          </Button>
        </div>
        <div className='text-secondary'>→</div>
        <div className='text-center'>
          <p className='text-xs text-secondary mb-2'>Error</p>
          <Button
            variant='secondary'
            size='sm'
            className='transition-colors duration-200 bg-red-500/10 text-red-600 hover:bg-red-500/20 dark:text-red-200'
            data-status='error'
          >
            Failed to copy
          </Button>
        </div>
        <div className='text-secondary'>→</div>
        <div className='text-center'>
          <p className='text-xs text-secondary mb-2'>Idle (after 2s)</p>
          <Button
            variant='secondary'
            size='sm'
            className='transition-colors duration-200'
            data-status='idle'
          >
            Copy URL
          </Button>
        </div>
      </div>
    </div>
  ),
};

/**
 * Demonstrates the icon-only variant with visual state changes.
 * The icon changes to a checkmark on success or X on error.
 */
export const IconOnlyWithStates: Story = {
  render: () => (
    <div className='space-y-6'>
      <div>
        <p className='text-sm font-medium mb-2'>
          Interactive (click to see transition):
        </p>
        <CopyToClipboardButton relativePath='/johndoe' iconName='Link' />
      </div>
      <div className='flex items-center gap-4'>
        <div className='text-center'>
          <p className='text-xs text-secondary mb-2'>Idle</p>
          <Button
            variant='secondary'
            size='sm'
            className='transition-colors duration-200'
            data-status='idle'
          >
            <Icon name='Link' className='h-4 w-4' aria-hidden='true' />
            <span className='sr-only'>Copy URL</span>
          </Button>
        </div>
        <div className='text-secondary'>→</div>
        <div className='text-center'>
          <p className='text-xs text-secondary mb-2'>Success</p>
          <Button
            variant='secondary'
            size='sm'
            className='transition-colors duration-200 bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 dark:text-emerald-200'
            data-status='success'
          >
            <Icon name='Check' className='h-4 w-4' aria-hidden='true' />
            <span className='sr-only'>✓ Copied!</span>
          </Button>
        </div>
        <div className='text-secondary'>→</div>
        <div className='text-center'>
          <p className='text-xs text-secondary mb-2'>Error</p>
          <Button
            variant='secondary'
            size='sm'
            className='transition-colors duration-200 bg-red-500/10 text-red-600 hover:bg-red-500/20 dark:text-red-200'
            data-status='error'
          >
            <Icon name='X' className='h-4 w-4' aria-hidden='true' />
            <span className='sr-only'>Failed to copy</span>
          </Button>
        </div>
      </div>
    </div>
  ),
};
