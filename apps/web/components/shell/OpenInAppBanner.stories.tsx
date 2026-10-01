import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { type ReactNode, useEffect, useState } from 'react';
import { OPEN_IN_APP_DISMISSAL_STORAGE_KEY } from '@/lib/mobile/open-in-app';
import { OpenInAppBanner } from './OpenInAppBanner';

const IPHONE_SAFARI_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

/**
 * The banner only renders for mobile-web user agents on eligible `/app/*`
 * routes, so the story stubs the Storybook pathname and navigator UA for the
 * duration of the render.
 */
function MobileSafariRoute({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    Object.defineProperty(globalThis.navigator, 'userAgent', {
      configurable: true,
      value: IPHONE_SAFARI_UA,
    });
    (globalThis as Record<string, unknown>).__JOVIE_MOCK_PATHNAME__ =
      '/app/start';
    globalThis.localStorage?.removeItem(OPEN_IN_APP_DISMISSAL_STORAGE_KEY);
    setReady(true);

    return () => {
      delete (globalThis.navigator as { userAgent?: string }).userAgent;
      delete (globalThis as Record<string, unknown>).__JOVIE_MOCK_PATHNAME__;
    };
  }, []);

  return ready ? children : null;
}

const meta = {
  title: 'Shell/OpenInAppBanner',
  component: OpenInAppBanner,
  parameters: {
    layout: 'fullscreen',
    viewport: { defaultViewport: 'mobile1' },
    docs: {
      description: {
        component:
          '"Open in Jovie" prompt shown on eligible mobile-web `/app/*` routes. Fires the verified `ie.jov.jovie://` deep link and stays on the page when the app is not installed.',
      },
    },
  },
  decorators: [
    Story => (
      <MobileSafariRoute>
        <div className='relative h-40 bg-surface-1'>
          <Story />
        </div>
      </MobileSafariRoute>
    ),
  ],
} satisfies Meta<typeof OpenInAppBanner>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
