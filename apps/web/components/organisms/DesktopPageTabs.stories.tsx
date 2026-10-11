import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { type ReactNode, useEffect, useState } from 'react';
import { getRawElectronAPI } from '@/lib/desktop/electron-bridge';
import { DesktopPageTabs } from './DesktopPageTabs';

/** Browser-only adapter fixture; a real preload always retains ownership. */
function SourceBridge({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const previousRuntime = document.documentElement.dataset.desktopRuntime;
    const previousTabs = document.documentElement.dataset.desktopPageTabs;
    const installed = !getRawElectronAPI();
    if (installed)
      Object.defineProperty(window, 'electronAPI', {
        configurable: true,
        value: {
          platform: 'darwin',
          getPageTabs: async () => ({
            activeId: 1,
            tabs: [{ id: 1, title: 'Library', loading: false }],
          }),
          onPageTabsChanged: () => () => undefined,
          pageTabsCommand: async () => false,
        },
      });
    document.documentElement.dataset.desktopRuntime = 'electron';
    document.documentElement.dataset.desktopPageTabs = 'true';
    setReady(true);
    return () => {
      if (installed) Reflect.deleteProperty(window, 'electronAPI');
      if (previousTabs)
        document.documentElement.dataset.desktopPageTabs = previousTabs;
      else delete document.documentElement.dataset.desktopPageTabs;
      if (previousRuntime)
        document.documentElement.dataset.desktopRuntime = previousRuntime;
      else delete document.documentElement.dataset.desktopRuntime;
    };
  }, []);
  return ready ? children : null;
}

const meta = {
  title: 'Shell/DesktopPageTabsAdapter',
  component: DesktopPageTabs,
  decorators: [
    Story => (
      <SourceBridge>
        <Story />
      </SourceBridge>
    ),
  ],
} satisfies Meta<typeof DesktopPageTabs>;
export default meta;
type Story = StoryObj<typeof meta>;
export const NativeAdapter: Story = {};
