import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { type ReactNode, useState } from 'react';
import { RenderedFamily } from '@/.storybook/rendered-family';
import { HeaderActionsProvider } from '@/contexts/HeaderActionsContext';
import { SidebarContext } from './SidebarContext';
import { SidebarHeaderActions } from './SidebarHeaderActions';

/** Story-local sidebar state so this shell story never imports organisms. */
function StorySidebar({
  children,
  initialOpen = true,
}: {
  readonly children: ReactNode;
  readonly initialOpen?: boolean;
}) {
  const [open, setOpen] = useState(initialOpen);
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

const meta = {
  title: 'Shell/SidebarHeaderActions',
  component: SidebarHeaderActions,
  decorators: [
    Story => (
      <RenderedFamily
        name='sidebar-header-actions'
        owner='SidebarHeaderActions'
        interactive
      >
        <Story />
      </RenderedFamily>
    ),
    Story => (
      <HeaderActionsProvider>
        <StorySidebar>
          <div
            id='shell-left-rail'
            className='flex w-56 items-center bg-sidebar px-3 py-5'
            data-sidebar-brand-row='true'
          >
            <div className='flex h-7 min-w-0 flex-1 items-center text-app text-sidebar-item-foreground'>
              Logo
            </div>
            <Story />
          </div>
        </StorySidebar>
      </HeaderActionsProvider>
    ),
  ],
  args: {
    showActions: true,
    headerOwnsCollapsedToggle: true,
    inboxNavigation: { state: 'empty', pendingCount: 0 },
  },
} satisfies Meta<typeof SidebarHeaderActions>;

export default meta;
type Story = StoryObj<typeof meta>;

export const CaughtUp: Story = {};

/** Empty inbox: no unread dot, the bell still opens the Inbox. */
export const EmptyInbox: Story = {
  args: { inboxNavigation: { state: 'empty', pendingCount: 0 } },
};

/** A large backlog keeps the dot and lands the count in the accessible name. */
export const LongContentLargeBacklog: Story = {
  args: { inboxNavigation: { state: 'available', pendingCount: 1284 } },
};

/** Right-to-left: the row mirrors and the controls keep one rhythm. */
export const RtlRow: Story = {
  render: args => (
    <div dir='rtl'>
      <SidebarHeaderActions {...args} />
    </div>
  ),
};

export const PendingWork: Story = {
  args: { inboxNavigation: { state: 'available', pendingCount: 4 } },
};

export const StatusUnavailable: Story = {
  args: { inboxNavigation: undefined },
};

/** Route, operator and demo rails keep only the rail toggle. */
export const ToggleOnly: Story = {
  args: { showActions: false },
};
