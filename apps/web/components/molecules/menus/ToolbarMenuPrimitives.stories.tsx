import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@jovie/ui';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Music } from 'lucide-react';
import { fn } from 'storybook/test';
import { ToolbarMenuChoiceItem, ToolbarMenuRow } from './ToolbarMenuPrimitives';

const meta = {
  title: 'Molecules/Menus/ToolbarMenuPrimitives',
  component: ToolbarMenuChoiceItem,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <DropdownMenu defaultOpen>
        <DropdownMenuTrigger asChild>
          <Button variant='outline' size='sm'>
            Open
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className='w-48'>
          <Story />
        </DropdownMenuContent>
      </DropdownMenu>
    ),
  ],
  args: {
    label: 'Newest first',
    active: false,
    onSelect: fn(),
  },
} satisfies Meta<typeof ToolbarMenuChoiceItem>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Unselected: Story = {};

export const Selected: Story = {
  args: {
    active: true,
  },
};

export const Disabled: Story = {
  args: {
    disabled: true,
  },
};

export const WithLeadingIcon: Story = {
  args: {
    leadingVisual: <Music className='h-3.5 w-3.5' />,
  },
};

export const RowOnly: Story = {
  render: () => (
    <ToolbarMenuRow
      label='Newest first'
      leadingVisual={<Music className='h-3.5 w-3.5' />}
    />
  ),
};
