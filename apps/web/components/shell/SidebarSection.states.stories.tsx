import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReactNode } from 'react';
import { fn } from 'storybook/test';
import { SidebarSection } from './SidebarSection';

/** Rendered states of the collapsible sidebar section. */
const meta = {
  title: 'Shell/SidebarSection/States',
  component: SidebarSection,
  parameters: { layout: 'centered' },
  decorators: [
    function withSidebarWidth(StoryFn) {
      return (
        <div className='w-(--app-shell-sidebar-width) bg-sidebar'>
          {StoryFn()}
        </div>
      );
    },
  ],
  args: {
    name: 'Workspace',
    open: true,
    onToggle: fn(),
    itemCount: 0,
    children: null,
  },
} satisfies Meta<typeof SidebarSection>;

export default meta;
type Story = StoryObj<typeof meta>;

function RtlFrame({ children }: Readonly<{ children: ReactNode }>) {
  return <div dir='rtl'>{children}</div>;
}

function withRtlFrame(StoryFn: () => ReactNode) {
  return <RtlFrame>{StoryFn()}</RtlFrame>;
}

/** Empty: an open section with no rows. */
export const EmptyNoRows: Story = {};

/** Partial: the collapsed rail shows only the open section's rows. */
export const PartialRailCollapsed: Story = {
  args: { collapsed: true, itemCount: 1, children: <span>Releases</span> },
};

/** Rtl: the header and chevron in a right-to-left sidebar. */
export const RtlHeader: Story = {
  args: { name: 'مساحة العمل', itemCount: 1, children: <span>الإصدارات</span> },
  decorators: [withRtlFrame],
};
