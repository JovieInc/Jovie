import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { type ReactNode, useState } from 'react';
import { SidebarContext } from '@/components/shell/SidebarContext';
import {
  SIDEBAR_HEADER_ICON_BUTTON_CLASS,
  SIDEBAR_HEADER_ICON_CLASS,
} from '@/components/shell/sidebar-header-icon-button';
import { cn } from '@/lib/utils';
import { SidebarCollapseButton } from '.';

/** Story-local sidebar state so this molecule story never imports organisms. */
function SidebarProvider({ children }: { readonly children: ReactNode }) {
  const [open, setOpen] = useState(true);
  const [openMobile, setOpenMobile] = useState(false);
  return (
    <SidebarContext.Provider
      value={{
        state: open ? 'open' : 'closed',
        open,
        isPreview: false,
        isFloating: false,
        setOpen,
        openMobile,
        setOpenMobile,
        isMobile: false,
        toggleSidebar: () => setOpen(value => !value),
      }}
    >
      {children}
    </SidebarContext.Provider>
  );
}

const meta: Meta<typeof SidebarCollapseButton> = {
  title: 'Molecules/SidebarCollapseButton',
  component: SidebarCollapseButton,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'Borderless circular System B icon control for expanding/collapsing the app sidebar. No border in any state; hover uses a soft surface fill.',
      },
    },
  },
  decorators: [
    Story => (
      <SidebarProvider>
        <div
          id='shell-left-rail'
          className='flex items-center gap-4 bg-surface-1 p-6'
        >
          <Story />
          <span className='text-xs text-secondary-token'>
            Hover for circular highlight · no border
          </span>
        </div>
      </SidebarProvider>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const OnContentSurface: Story = {
  decorators: [
    Story => (
      <SidebarProvider>
        <div className='flex items-center gap-3 bg-(--app-shell-content-surface) p-4'>
          <Story />
        </div>
      </SidebarProvider>
    ),
  ],
};

/** Sidebar header row: same 28px box and 16px glyph as the bell and search. */
export const InSidebarHeader: Story = {
  args: {
    className: cn(
      SIDEBAR_HEADER_ICON_BUTTON_CLASS,
      'aria-pressed:text-sidebar-item-foreground [&_svg]:size-(--app-shell-sidebar-icon-size)'
    ),
    iconClassName: SIDEBAR_HEADER_ICON_CLASS,
  },
};
