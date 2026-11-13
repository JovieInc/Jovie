import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Home, Library } from 'lucide-react';
import { SidebarProvider } from './context';
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from './menu';
import { Sidebar } from './sidebar';

const meta = {
  title: 'Organisms/Sidebar/sidebar',
  component: Sidebar,
  parameters: {
    layout: 'centered',
  },
  // Sidebar reads useSidebar(); the app always mounts it under a provider.
  decorators: [
    Story => (
      <SidebarProvider>
        <Story />
      </SidebarProvider>
    ),
  ],
} satisfies Meta<typeof Sidebar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

function RailRows({
  rows,
}: {
  readonly rows: readonly {
    readonly label: string;
    readonly icon: typeof Home;
  }[];
}) {
  return (
    <SidebarMenu className='p-2'>
      {rows.map(({ label, icon: Icon }) => (
        <SidebarMenuItem key={label}>
          <SidebarMenuButton>
            <Icon aria-hidden='true' />
            <span>{label}</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  );
}

/** A static rail that has its navigation rows but no footer or account panel. */
export const PartialNavigationOnly: Story = {
  args: {
    collapsible: 'none',
    className: 'h-64',
    children: <RailRows rows={[{ label: 'Home', icon: Home }]} />,
  },
};

/** Long row labels truncate inside the fixed rail width. */
export const LongContentRows: Story = {
  args: {
    collapsible: 'none',
    className: 'h-64',
    children: (
      <RailRows
        rows={[
          { label: 'Home', icon: Home },
          {
            label:
              'Release Planning for The Extraordinarily Long Album Title (Deluxe Anniversary Remastered Edition)',
            icon: Library,
          },
        ]}
      />
    ),
  },
};

export const RtlRail: Story = {
  args: {
    collapsible: 'none',
    side: 'right',
    className: 'h-64',
    children: (
      <RailRows
        rows={[
          { label: 'الرئيسية', icon: Home },
          { label: 'المكتبة', icon: Library },
        ]}
      />
    ),
  },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
};
