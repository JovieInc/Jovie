import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { type ReactNode, useEffect } from 'react';
import { DesktopPageTabsView } from './DesktopPageTabsView';

function NativeShellPreview({ children }: { children: ReactNode }) {
  useEffect(() => {
    const root = document.documentElement;
    const previousRuntime = root.dataset.desktopRuntime;
    const previousTabs = root.dataset.desktopPageTabs;
    root.dataset.desktopRuntime = 'electron';
    root.dataset.desktopPageTabs = 'true';
    return () => {
      if (previousRuntime) root.dataset.desktopRuntime = previousRuntime;
      else delete root.dataset.desktopRuntime;
      if (previousTabs) root.dataset.desktopPageTabs = previousTabs;
      else delete root.dataset.desktopPageTabs;
    };
  }, []);
  return children;
}

const meta = {
  title: 'Shell/DesktopPageTabs',
  component: DesktopPageTabsView,
  decorators: [
    Story => (
      <NativeShellPreview>
        <Story />
      </NativeShellPreview>
    ),
  ],
  args: {
    command: async () => true,
    state: {
      activeId: 1,
      tabs: [{ id: 1, title: 'New Chat', loading: false }],
    },
  },
} satisfies Meta<typeof DesktopPageTabsView>;
export default meta;
type Story = StoryObj<typeof meta>;
export const SinglePage: Story = {};
export const ThreePages: Story = {
  args: {
    state: {
      activeId: 2,
      tabs: [
        { id: 1, title: 'New Chat', loading: false },
        { id: 2, title: 'Library', loading: true },
        { id: 3, title: 'Profiles', loading: false },
      ],
    },
  },
};
export const AwaitingNativeBridge: Story = { args: { state: null } };
