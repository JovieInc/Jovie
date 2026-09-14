import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Button } from './button';
import { Kbd } from './kbd';
import { Tooltip, TooltipContent, TooltipTrigger } from './tooltip';

const meta: Meta<typeof Kbd> = {
  title: 'UI/Atoms/Kbd',
  component: Kbd,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { args: { children: '⌘K' } };
export const TooltipVariant: Story = {
  args: { children: 'Esc', variant: 'tooltip' },
  parameters: { backgrounds: { default: 'dark' } },
};

export const ShortcutSequence: Story = {
  render: () => (
    <div className='flex items-center gap-1.5 text-sm text-secondary-token'>
      <Kbd>⌘</Kbd>
      <Kbd>⇧</Kbd>
      <Kbd>P</Kbd>
      <span className='ml-2'>Open command palette</span>
    </div>
  ),
};

/**
 * Real Tooltip owner composition for visual review. The short and long
 * examples keep the keycaps inside the same collision-safe portal so spacing,
 * radius, font loading, and reflow are judged where the atom is used.
 */
export const TooltipComposition: Story = {
  parameters: { layout: 'fullscreen' },
  render: () => (
    <div
      data-testid='kbd-tooltip-composition'
      className='flex min-h-64 w-full flex-col items-center justify-center gap-12 bg-surface-0 p-8'
    >
      <Tooltip defaultOpen>
        <TooltipTrigger asChild>
          <Button
            variant='outline'
            size='sm'
            data-testid='kbd-tooltip-short-trigger'
          >
            Command palette
          </Button>
        </TooltipTrigger>
        <TooltipContent
          contentVariant='compact'
          side='bottom'
          className='flex w-screen max-w-56 items-center gap-2'
        >
          <span>Open palette</span>
          <Kbd variant='tooltip'>⌘K</Kbd>
        </TooltipContent>
      </Tooltip>

      <Tooltip defaultOpen>
        <TooltipTrigger asChild>
          <Button
            variant='outline'
            size='sm'
            data-testid='kbd-tooltip-long-trigger'
          >
            Navigation
          </Button>
        </TooltipTrigger>
        <TooltipContent
          contentVariant='rich'
          side='bottom'
          className='flex w-screen max-w-56 flex-wrap items-center gap-2'
        >
          <span className='min-w-0'>
            Move focus through the command palette
          </span>
          <span
            data-testid='kbd-tooltip-shortcut'
            className='flex shrink-0 items-center gap-1'
          >
            <Kbd variant='tooltip'>Ctrl</Kbd>
            <Kbd variant='tooltip'>⇧</Kbd>
            <Kbd variant='tooltip'>P</Kbd>
          </span>
        </TooltipContent>
      </Tooltip>
    </div>
  ),
};

/** Rich Tooltip owner composition with a long shortcut label at compact width. */
export const TooltipLongKey: Story = {
  parameters: { layout: 'centered' },
  render: () => (
    <Tooltip defaultOpen>
      <TooltipTrigger asChild>
        <Button variant='outline' size='sm'>
          Navigate
        </Button>
      </TooltipTrigger>
      <TooltipContent
        contentVariant='rich'
        side='bottom'
        className='flex w-screen max-w-56 items-center gap-2'
      >
        <span className='min-w-0'>Move through the command palette</span>
        <Kbd
          variant='tooltip'
          data-testid='kbd-tooltip-long-key'
          className='min-w-0 break-words'
        >
          Ctrl Alt Shift ArrowRight
        </Kbd>
      </TooltipContent>
    </Tooltip>
  ),
};
