import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Button } from './button';
import { Kbd } from './kbd';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from './tooltip';

const meta: Meta<typeof Tooltip> = {
  title: 'UI/Atoms/Tooltip',
  component: Tooltip,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'A Linear-style tooltip with always-dark appearance for consistent visibility. Features sensible delays, pointer safety, reduced motion support, and optional arrow (hidden by default).',
      },
    },
  },
  tags: ['autodocs'],
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
export const Basic: Story = {
  render: () => (
    <Tooltip>
      <TooltipTrigger>
        <Button variant='outline'>Hover for tooltip</Button>
      </TooltipTrigger>
      <TooltipContent>
        <span>This is a basic tooltip</span>
      </TooltipContent>
    </Tooltip>
  ),
};

/**
 * Tooltip with arrow enabled (arrow is hidden by default)
 */
export const WithArrow: Story = {
  render: () => (
    <Tooltip>
      <TooltipTrigger>
        <Button variant='outline'>With arrow tooltip</Button>
      </TooltipTrigger>
      <TooltipContent showArrow={true}>
        <span>Tooltip with arrow pointer</span>
      </TooltipContent>
    </Tooltip>
  ),
};

/**
 * Tooltip with keyboard shortcut using the Kbd component
 */
export const WithKeyboardShortcut: Story = {
  render: () => (
    <Tooltip>
      <TooltipTrigger>
        <Button variant='outline'>Save Document</Button>
      </TooltipTrigger>
      <TooltipContent>
        <span>Save your changes</span>
        <Kbd variant='tooltip'>⌘S</Kbd>
      </TooltipContent>
    </Tooltip>
  ),
};

/**
 * Tooltip placement variations
 */
export const Placements: Story = {
  render: () => (
    <div className='grid grid-cols-2 gap-8 items-center justify-center'>
      <Tooltip>
        <TooltipTrigger>
          <Button variant='outline'>Top</Button>
        </TooltipTrigger>
        <TooltipContent side='top'>
          <span>Tooltip on top</span>
        </TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger>
          <Button variant='outline'>Right</Button>
        </TooltipTrigger>
        <TooltipContent side='right'>
          <span>Tooltip on right</span>
        </TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger>
          <Button variant='outline'>Bottom</Button>
        </TooltipTrigger>
        <TooltipContent side='bottom'>
          <span>Tooltip on bottom</span>
        </TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger>
          <Button variant='outline'>Left</Button>
        </TooltipTrigger>
        <TooltipContent side='left'>
          <span>Tooltip on left</span>
        </TooltipContent>
      </Tooltip>
    </div>
  ),
};

/**
 * Interactive region example - demonstrates proper trigger wrapping
 */
export const InteractiveRegion: Story = {
  render: () => (
    <div className='flex gap-4 items-center'>
      {/* Proper pattern for disabled button with tooltip */}
      <Tooltip>
        <TooltipTrigger>
          <span className='inline-block'>
            <Button variant='outline' disabled className='pointer-events-none'>
              Disabled Button
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent>
          <span>This action is currently unavailable</span>
        </TooltipContent>
      </Tooltip>

      {/* Interactive icon with tooltip */}
      <Tooltip>
        <TooltipTrigger>
          <button
            type='button'
            className='p-2 rounded-md hover:bg-surface-2 focus-ring text-secondary-token hover:text-primary-token transition-colors'
            aria-label='More options'
          >
            <svg
              className='w-4 h-4'
              fill='none'
              stroke='currentColor'
              viewBox='0 0 24 24'
              aria-hidden='true'
            >
              <path
                strokeLinecap='round'
                strokeLinejoin='round'
                strokeWidth={2}
                d='M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zM12 13a1 1 0 110-2 1 1 0 010 2zM12 20a1 1 0 110-2 1 1 0 010 2z'
              />
            </svg>
          </button>
        </TooltipTrigger>
        <TooltipContent>
          <span>More options</span>
        </TooltipContent>
      </Tooltip>
    </div>
  ),
};

/**
 * Long content tooltip with proper text wrapping
 */
export const LongContent: Story = {
  render: () => (
    <Tooltip>
      <TooltipTrigger>
        <Button variant='outline'>Complex Action</Button>
      </TooltipTrigger>
      <TooltipContent className='max-w-xs'>
        <div>
          <div className='font-semibold mb-1'>Complex Action</div>
          <div className='text-xs text-secondary-token'>
            This action will perform multiple operations including data
            validation, API synchronization, and cache invalidation.
          </div>
        </div>
      </TooltipContent>
    </Tooltip>
  ),
};

/**
 * Always-dark tooltip appearance (same in both light and dark themes)
 */
export const AlwaysDark: Story = {
  render: () => (
    <div className='flex gap-8'>
      <div className='light'>
        <Tooltip>
          <TooltipTrigger>
            <Button variant='outline'>Light Theme</Button>
          </TooltipTrigger>
          <TooltipContent>
            <span>Same dark tooltip in light theme</span>
          </TooltipContent>
        </Tooltip>
      </div>
      <div className='dark'>
        <Tooltip>
          <TooltipTrigger>
            <Button variant='outline'>Dark Theme</Button>
          </TooltipTrigger>
          <TooltipContent>
            <span>Same dark tooltip in dark theme</span>
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  ),
};

/**
 * Accessibility features demonstration
 */
export const AccessibilityFeatures: Story = {
  render: () => (
    <div className='space-y-4'>
      <div>
        <h3 className='text-sm font-semibold mb-2'>Keyboard Navigation</h3>
        <div className='flex gap-2'>
          <Tooltip>
            <TooltipTrigger>
              <Button variant='outline'>Tab to focus</Button>
            </TooltipTrigger>
            <TooltipContent>
              <span>Tooltip appears on focus for keyboard users</span>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger>
              <Button variant='outline'>Press Escape</Button>
            </TooltipTrigger>
            <TooltipContent>
              <span>Press Escape to close this tooltip</span>
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      <div>
        <h3 className='text-sm font-semibold mb-2'>Screen Reader Support</h3>
        <Tooltip>
          <TooltipTrigger>
            <Button variant='outline' aria-describedby='save-description'>
              Save File
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <span id='save-description'>
              Saves the current document to your local storage
            </span>
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  ),
};
