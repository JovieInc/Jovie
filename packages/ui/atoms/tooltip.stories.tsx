import type { Meta, StoryObj } from '@storybook/react';
import * as React from 'react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from './tooltip';

const meta = {
  title: 'UI/Atoms/Tooltip',
  component: TooltipContent,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: 'An accessible tooltip component built with Radix UI, featuring SSR support, reduced motion, and customizable delays.',
      },
    },
  },
  decorators: [
    (Story) => (
      <TooltipProvider>
        <div className="flex min-h-[200px] items-center justify-center p-8">
          <Story />
        </div>
      </TooltipProvider>
    ),
  ],
  argTypes: {
    showArrow: {
      control: 'boolean',
      description: 'Whether to show an arrow pointing to the trigger',
    },
    sideOffset: {
      control: { type: 'number', min: 0, max: 30 },
      description: 'Distance in pixels from the trigger',
    },
  },
} satisfies Meta<typeof TooltipContent>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Basic tooltip with default styling
 */
export const Basic: Story = {
  render: (args) => (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-800 dark:bg-neutral-50 dark:text-neutral-900 dark:hover:bg-neutral-200"
          type="button"
        >
          Hover me
        </button>
      </TooltipTrigger>
      <TooltipContent {...args}>
        This is a helpful tooltip
      </TooltipContent>
    </Tooltip>
  ),
  args: {
    showArrow: false,
    sideOffset: 8,
  },
};

/**
 * Tooltip with arrow pointing to the trigger
 */
export const WithArrow: Story = {
  render: (args) => (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
          type="button"
        >
          With arrow
        </button>
      </TooltipTrigger>
      <TooltipContent {...args}>
        Arrow points to the trigger
      </TooltipContent>
    </Tooltip>
  ),
  args: {
    showArrow: true,
    sideOffset: 8,
  },
};

/**
 * Interactive region showing multiple tooltips
 */
export const InteractiveRegion: Story = {
  render: () => (
    <div className="flex gap-4">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            className="rounded-full bg-green-600 p-2 text-white hover:bg-green-700"
            type="button"
            aria-label="Add item"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
        </TooltipTrigger>
        <TooltipContent>
          Add new item
        </TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            className="rounded-full bg-yellow-600 p-2 text-white hover:bg-yellow-700"
            type="button"
            aria-label="Edit item"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
          </button>
        </TooltipTrigger>
        <TooltipContent showArrow>
          Edit this item
        </TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            className="rounded-full bg-red-600 p-2 text-white hover:bg-red-700"
            type="button"
            aria-label="Delete item"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </TooltipTrigger>
        <TooltipContent>
          Delete permanently
        </TooltipContent>
      </Tooltip>
    </div>
  ),
};

/**
 * Tooltip on a disabled element (wrapped to ensure events fire)
 */
export const DisabledElement: Story = {
  render: () => (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className="inline-block">
          <button
            className="cursor-not-allowed rounded-md bg-neutral-300 px-4 py-2 text-sm text-neutral-500"
            type="button"
            disabled
          >
            Disabled button
          </button>
        </span>
      </TooltipTrigger>
      <TooltipContent>
        This feature is currently unavailable
      </TooltipContent>
    </Tooltip>
  ),
};

/**
 * Long content with wrapping
 */
export const LongContent: Story = {
  render: () => (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          className="rounded-md bg-purple-600 px-4 py-2 text-sm text-white hover:bg-purple-700"
          type="button"
        >
          Complex tooltip
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        This is a longer tooltip with more detailed information that might wrap to multiple lines when displayed.
      </TooltipContent>
    </Tooltip>
  ),
};

/**
 * Different positioning
 */
export const Positioning: Story = {
  render: () => (
    <div className="grid grid-cols-3 gap-8">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-800 dark:bg-neutral-50 dark:text-neutral-900 dark:hover:bg-neutral-200"
            type="button"
          >
            Top
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" showArrow>
          Appears on top
        </TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-800 dark:bg-neutral-50 dark:text-neutral-900 dark:hover:bg-neutral-200"
            type="button"
          >
            Right
          </button>
        </TooltipTrigger>
        <TooltipContent side="right" showArrow>
          Appears on right
        </TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-800 dark:bg-neutral-50 dark:text-neutral-900 dark:hover:bg-neutral-200"
            type="button"
          >
            Bottom
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" showArrow>
          Appears on bottom
        </TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-800 dark:bg-neutral-50 dark:text-neutral-900 dark:hover:bg-neutral-200"
            type="button"
          >
            Left
          </button>
        </TooltipTrigger>
        <TooltipContent side="left" showArrow>
          Appears on left
        </TooltipContent>
      </Tooltip>
    </div>
  ),
};

/**
 * Custom styled tooltip
 */
export const CustomStyled: Story = {
  render: () => (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          className="rounded-md bg-gradient-to-r from-pink-500 to-violet-500 px-4 py-2 text-sm text-white hover:from-pink-600 hover:to-violet-600"
          type="button"
        >
          Custom styled
        </button>
      </TooltipTrigger>
      <TooltipContent
        className="bg-gradient-to-r from-pink-500 to-violet-500 border-0 text-white"
        showArrow
        arrowClassName="fill-pink-500"
      >
        Fancy tooltip styling!
      </TooltipContent>
    </Tooltip>
  ),
};