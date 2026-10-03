import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import * as React from 'react';
import { OPEN_IN_APP_DISMISSAL_STORAGE_KEY } from '@/lib/mobile/open-in-app';
import { OpenInAppBanner } from './OpenInAppBanner';

const IPHONE_SAFARI_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

type PathnameWindow = Window & { __jovieStorybookPathname?: string };

/**
 * The banner only resolves eligibility in a mounted effect against the real
 * `navigator.userAgent` and `usePathname()`, so the story has to simulate an
 * iPhone-Safari visitor on an `/app/*` route. Both globals are set before the
 * story's children render and restored on unmount.
 */
function AsMobileSafariAppRoute({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const win = window as PathnameWindow;
  const previousPathname = win.__jovieStorybookPathname;
  const hadOwnUserAgent = Object.hasOwn(window.navigator, 'userAgent');
  const previousUserAgent = window.navigator.userAgent;

  win.__jovieStorybookPathname = '/app/chat';
  Object.defineProperty(window.navigator, 'userAgent', {
    configurable: true,
    value: IPHONE_SAFARI_UA,
  });
  window.localStorage.removeItem(OPEN_IN_APP_DISMISSAL_STORAGE_KEY);

  React.useEffect(() => {
    return () => {
      win.__jovieStorybookPathname = previousPathname;
      if (hadOwnUserAgent) {
        Object.defineProperty(window.navigator, 'userAgent', {
          configurable: true,
          value: previousUserAgent,
        });
      } else {
        delete (window.navigator as { userAgent?: string }).userAgent;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <>{children}</>;
}

const meta = {
  title: 'Shell/OpenInAppBanner',
  component: OpenInAppBanner,
  parameters: {
    layout: 'fullscreen',
    viewport: { defaultViewport: 'mobile1' },
    nextjs: {
      navigation: {
        pathname: '/app/chat',
      },
    },
  },
  decorators: [
    Story => (
      <AsMobileSafariAppRoute>
        <div className='relative h-48 w-full bg-(--app-shell-content-surface)'>
          <Story />
        </div>
      </AsMobileSafariAppRoute>
    ),
  ],
} satisfies Meta<typeof OpenInAppBanner>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
