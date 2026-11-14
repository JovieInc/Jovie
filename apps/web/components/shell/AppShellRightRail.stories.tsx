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

const LONG_ACTIVITY = Array.from(
  { length: 40 },
  (_, index) =>
    `Pitch update ${index + 1}: Midnight City (Extended Club Mix) was added to the Late Night Electronic Discoveries editorial playlist`
);

/** A long panel clips inside the rail; the drawer owns its own scroll. */
export const LongContent: Story = {
  args: {
    children: (
      <section
        aria-label='Recent rail activity'
        // biome-ignore lint/a11y/noNoninteractiveTabindex: keyboard entry point for the scrollable region (axe scrollable-region-focusable)
        tabIndex={0}
        className='h-96 w-80 overflow-auto p-3 text-sm'
      >
        <ul className='space-y-2'>
          {LONG_ACTIVITY.map(line => (
            <li key={line} className='truncate'>
              {line}
            </li>
          ))}
        </ul>
      </section>
    ),
  },
};

export const RtlContextPanel: Story = {
  args: {
    children: (
      <div dir='rtl' lang='ar' className='w-80 p-3 text-sm'>
        <p className='truncate'>
          تفاصيل الإصدار: منتصف الليل في المدينة — النسخة الممتدة للنوادي
        </p>
        <p>آخر تحديث قبل خمس دقائق</p>
      </div>
    ),
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
  args: { children: null },
  render: () => <OwnedMenuPreviewFixture />,
};
