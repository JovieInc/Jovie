import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Button } from './button';
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
    <TooltipShortcut label='Open command palette' shortcut='⌘K' defaultOpen>
      <Button variant='ghost'>Command</Button>
    </TooltipShortcut>
  ),
};

export const RichExplanation: Story = {
  render: () => (
    <TooltipShortcut
      label='Exports every visible row using the active filters.'
      contentVariant='rich'
      defaultOpen
      side='bottom'
    >
      <Button variant='secondary'>Export</Button>
    </TooltipShortcut>
  ),
};
