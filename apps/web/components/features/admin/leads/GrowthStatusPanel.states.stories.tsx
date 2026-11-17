import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import type { LeadPipelineSettings } from '@/lib/queries';
import { GrowthStatusPanel } from './GrowthStatusPanel';

const SETTINGS_PATH = '/api/admin/leads/settings';

const settings: LeadPipelineSettings = {
  enabled: true,
  discoveryEnabled: true,
  autoIngestEnabled: true,
  autoIngestMinFitScore: 60,
  autoIngestDailyLimit: 25,
  dailyQueryBudget: 100,
  dailySendCap: 25,
  maxPerHour: 10,
  rampMode: 'manual',
  guardrailsEnabled: true,
  guardrailThresholds: {
    minimumSampleSize: 50,
    increaseClaimClickRate: 0.1,
    holdClaimClickRateFloor: 0.05,
    pauseClaimClickRateFloor: 0.02,
    maxBounceComplaintRate: 0.03,
    maxUnsubscribeRate: 0.02,
    maxProviderFailureRate: 0.05,
  },
  queriesUsedToday: 42,
  autoIngestedToday: 7,
};

/** Answers the settings read for one story; nothing reaches the API. */
function stubSettings(answer: () => Promise<Response>) {
  return () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      const url = new URL(String(input), window.location.href);
      if (url.pathname === SETTINGS_PATH) return answer();
      return originalFetch(input, init);
    };
    return () => {
      globalThis.fetch = originalFetch;
    };
  };
}

const answerWith = (value: LeadPipelineSettings) => async () =>
  Response.json({ settings: value });

function Frame({ dir = 'ltr' }: { readonly dir?: 'ltr' | 'rtl' }) {
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false } } })
  );
  return (
    <QueryClientProvider client={client}>
      <div dir={dir} className='w-full max-w-4xl'>
        <GrowthStatusPanel />
      </div>
    </QueryClientProvider>
  );
}

function renderFrame() {
  return <Frame />;
}

const meta = {
  title: 'Features/Admin/Leads/GrowthStatusPanel States',
  component: GrowthStatusPanel,
  parameters: { layout: 'centered' },
  render: renderFrame,
} satisfies Meta<typeof GrowthStatusPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Loading: the settings read never answers. */
export const LoadingSettings: Story = {
  beforeEach: stubSettings(() => new Promise<Response>(() => {})),
};

/** Error: the settings read answers 500. */
export const ErrorSettingsFailed: Story = {
  beforeEach: stubSettings(async () => new Response('error', { status: 500 })),
};

/** Offline: the settings read cannot leave the browser. */
export const OfflineSettingsUnreachable: Story = {
  beforeEach: stubSettings(async () => {
    throw new TypeError('Failed to fetch');
  }),
};

/** Long content: a custom configuration with five-figure limits. */
export const LongContentCustomLimits: Story = {
  beforeEach: stubSettings(
    answerWith({
      ...settings,
      dailySendCap: 125_000,
      maxPerHour: 9_800,
      dailyQueryBudget: 480_000,
      queriesUsedToday: 312_644,
      autoIngestDailyLimit: 75_000,
      autoIngestedToday: 48_213,
    })
  ),
};

function renderRtl() {
  return <Frame dir='rtl' />;
}

/** RTL: the controls mirror in a right-to-left container. */
export const RtlControls: Story = {
  beforeEach: stubSettings(answerWith(settings)),
  render: renderRtl,
};
