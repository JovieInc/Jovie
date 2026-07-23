import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Button } from './button';
import { Tooltip, TooltipContent, TooltipTrigger } from './tooltip';
import { TooltipShortcut } from './tooltip-shortcut';

const meta: Meta<typeof TooltipShortcut> = {
  title: 'UI/Atoms/TooltipShortcut',
  component: TooltipShortcut,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Tooltip defaultOpen>
      <TooltipTrigger asChild>
        <Button variant='ghost'>Command</Button>
      </TooltipTrigger>
      <TooltipContent>
        <TooltipShortcut label='Open command palette' shortcut='⌘K' />
      </TooltipContent>
    </Tooltip>
  ),
};
