import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { queryKeys } from '@/lib/queries/keys';
import type { PixelHealthData } from '@/lib/queries/usePixelHealthQuery';
import type { PixelSettingsData } from '@/lib/queries/usePixelSettingsQuery';
import { SettingsAdPixelsSection } from './SettingsAdPixelsSection';

const configuredSettings: PixelSettingsData = {
  pixels: {
    facebookPixelId: '1234567890123456',
    googleMeasurementId: 'G-ABCDE12345',
    tiktokPixelId: null,
    enabled: true,
    facebookEnabled: true,
    googleEnabled: true,
    tiktokEnabled: false,
  },
  hasTokens: {
    facebook: true,
    google: true,
    tiktok: false,
  },
};

const healthyStatus: PixelHealthData = {
  platforms: {
    facebook: {
      status: 'healthy',
      totalSent: 482,
      totalFailed: 3,
      lastSuccessAt: '2026-09-27T00:00:00.000Z',
    },
    google: {
      status: 'healthy',
      totalSent: 310,
      totalFailed: 0,
      lastSuccessAt: '2026-09-27T00:00:00.000Z',
    },
    tiktok: {
      status: 'inactive',
      totalSent: 0,
      totalFailed: 0,
      lastSuccessAt: null,
    },
  },
  aggregate: {
    totalEventsThisWeek: 792,
    overallSuccessRate: 99.6,
  },
};

const inactiveStatus: PixelHealthData = {
  platforms: {
    facebook: {
      status: 'inactive',
      totalSent: 0,
      totalFailed: 0,
      lastSuccessAt: null,
    },
    google: {
      status: 'inactive',
      totalSent: 0,
      totalFailed: 0,
      lastSuccessAt: null,
    },
    tiktok: {
      status: 'inactive',
      totalSent: 0,
      totalFailed: 0,
      lastSuccessAt: null,
    },
  },
  aggregate: {
    totalEventsThisWeek: 0,
    overallSuccessRate: 0,
  },
};

function PixelsStoryShell({
  settings,
  health,
  children,
}: {
  readonly settings: PixelSettingsData | null;
  readonly health: PixelHealthData | null;
  readonly children: ReactNode;
}) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        refetchOnWindowFocus: false,
        staleTime: Infinity,
      },
    },
  });
  if (settings) {
    queryClient.setQueryData(queryKeys.pixels.settings(), settings);
  }
  if (health) {
    queryClient.setQueryData(queryKeys.pixels.health(), health);
  }
  return (
    <QueryClientProvider client={queryClient}>
      <div className='w-2xl max-w-full'>{children}</div>
    </QueryClientProvider>
  );
}

const meta = {
  title: 'Dashboard/Organisms/SettingsAdPixelsSection',
  component: SettingsAdPixelsSection,
  parameters: {
    layout: 'padded',
    // These aren't props of SettingsAdPixelsSection itself (only `isPro` is)
    // — the required-props scanner also picks up the internal, non-exported
    // PlatformSectionProps interface used by a helper in the same file.
    jovie: {
      uncoveredProps: [
        'platform',
        'platformKey',
        'description',
        'pixelIdLabel',
        'pixelIdPlaceholder',
        'pixelIdName',
        'pixelIdValue',
        'tokenLabel',
        'tokenPlaceholder',
        'tokenName',
        'tokenValue',
        'helpUrl',
        'helpText',
        'onPixelIdChange',
        'onTokenChange',
        'isConfigured',
      ],
    },
  },
  args: {
    isPro: true,
  },
} satisfies Meta<typeof SettingsAdPixelsSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Configured: Story = {
  decorators: [
    Story => (
      <PixelsStoryShell settings={configuredSettings} health={healthyStatus}>
        <Story />
      </PixelsStoryShell>
    ),
  ],
};

export const Empty: Story = {
  decorators: [
    Story => (
      <PixelsStoryShell
        settings={{
          pixels: {
            facebookPixelId: null,
            googleMeasurementId: null,
            tiktokPixelId: null,
            enabled: true,
            facebookEnabled: false,
            googleEnabled: false,
            tiktokEnabled: false,
          },
          hasTokens: { facebook: false, google: false, tiktok: false },
        }}
        health={inactiveStatus}
      >
        <Story />
      </PixelsStoryShell>
    ),
  ],
};

export const FreePlanGated: Story = {
  args: {
    isPro: false,
  },
  decorators: [
    Story => (
      <PixelsStoryShell settings={null} health={null}>
        <Story />
      </PixelsStoryShell>
    ),
  ],
};

export const EmptyLight: Story = {
  ...Empty,
  parameters: { themes: { themeOverride: 'light' } },
};

export const ConfiguredLight: Story = {
  ...Configured,
  parameters: { themes: { themeOverride: 'light' } },
};
