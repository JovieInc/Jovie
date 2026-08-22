import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { SidebarIdentitySplitLayoutFixture } from './fixtures/split-layout';
import { SidebarIdentityGroup } from './SidebarIdentityGroup';

function RailFrame({
  collapsible,
  width,
  children,
}: {
  readonly collapsible?: string;
  readonly width: number;
  readonly children: ReactNode;
}) {
  return (
    <div
      className='group bg-base text-sidebar-foreground'
      data-collapsible={collapsible}
      style={{ width }}
    >
      {children}
    </div>
  );
}

const meta: Meta<typeof SidebarIdentityGroup> = {
  title: 'Organisms/SidebarIdentityGroup',
  component: SidebarIdentityGroup,
  parameters: {
    layout: 'centered',
    jovie: {
      uncoveredProps: [],
    },
  },
  args: {
    profileHref: '/timwhite',
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Expanded: Story = {
  decorators: [
    Story => (
      <RailFrame width={224}>
        <Story />
      </RailFrame>
    ),
  ],
};

export const Narrow: Story = {
  decorators: [
    Story => (
      <RailFrame width={160}>
        <Story />
      </RailFrame>
    ),
  ],
};

export const Collapsed: Story = {
  decorators: [
    Story => (
      <RailFrame width={52} collapsible='icon'>
        <Story />
      </RailFrame>
    ),
  ],
};

export const SplitLayoutFixture: Story = {
  render: () => (
    <RailFrame width={224}>
      <SidebarIdentitySplitLayoutFixture
        profileHref='/timwhite'
        displayName='Tim White'
      />
    </RailFrame>
  ),
};

export const SidebarAndProfileSweep: Story = {
  render: () => (
    <div className='flex items-start gap-8 bg-base p-6 text-sidebar-foreground'>
      <div className='flex flex-col gap-6'>
        <RailFrame width={224}>
          <SidebarIdentityGroup profileHref='/timwhite' />
        </RailFrame>
        <RailFrame width={160}>
          <SidebarIdentityGroup profileHref='/timwhite' />
        </RailFrame>
        <RailFrame width={52} collapsible='icon'>
          <SidebarIdentityGroup profileHref='/timwhite' />
        </RailFrame>
      </div>
      <div
        data-testid='profile-identity-surface'
        className='w-[280px] rounded-xl border border-sidebar-border px-4 py-3'
      >
        <p className='text-app text-sidebar-item-foreground'>Tim White</p>
        <Link href='/timwhite' className='text-2xs text-sidebar-muted'>
          jov.ie/timwhite
        </Link>
      </div>
    </div>
  ),
};
