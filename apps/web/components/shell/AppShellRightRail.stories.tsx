import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@jovie/ui';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useState } from 'react';
import { AppShellRightRail } from './AppShellRightRail';
import { useRailPreview } from './useRailPreview';

const meta = {
  title: 'Shell/AppShellRightRail',
  component: AppShellRightRail,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof AppShellRightRail>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    children: 'Right rail content',
  },
};

function OwnedMenuPreviewFixture() {
  const [pinned, setPinned] = useState(false);
  const { isPreview, dismissPreview } = useRailPreview({
    side: 'right',
    pinned,
    enabled: true,
  });
  return (
    <div className='flex gap-3 p-4'>
      <Button
        data-rail-toggle='right'
        onClick={() => {
          dismissPreview();
          setPinned(value => !value);
        }}
      >
        Pin rail
      </Button>
      <div
        data-rail-preview-region='right'
        data-testid='owned-menu-rail'
        data-preview={isPreview}
        data-pinned={pinned}
      >
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button>Rail account</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side='bottom' align='start'>
            <DropdownMenuItem>Profile</DropdownMenuItem>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>Preferences</DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuItem>Keyboard shortcuts</DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <Button>Outside rail</Button>
    </div>
  );
}

export const OwnedMenuPreview: Story = {
  render: () => <OwnedMenuPreviewFixture />,
};
