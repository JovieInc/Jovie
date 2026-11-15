import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, userEvent, within } from 'storybook/test';
import {
  type DiscoveryKeywordDiagnostic,
  type DiscoveryResultResponse,
  type LeadPipelineSettings,
  queryKeys,
} from '@/lib/queries';
import { LeadPipelineControls } from './LeadPipelineControls';

/**
 * Rendered states of the lead pipeline controls. Stories seed the settings
 * query in their own client and stub the discovery request they send.
 */
const meta = {
  title: 'Features/Admin/Leads/LeadPipelineControls/States',
  component: LeadPipelineControls,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof LeadPipelineControls>;

export default meta;
type Story = StoryObj<typeof meta>;
/** The component's optional props, as the stories' decorators receive them. */
type Args = Parameters<typeof LeadPipelineControls>[0];

const SETTINGS: LeadPipelineSettings = {
  enabled: true,
  discoveryEnabled: true,
  autoIngestEnabled: false,
  autoIngestMinFitScore: 60,
  autoIngestDailyLimit: 10,
  dailyQueryBudget: 100,
  dailySendCap: 20,
  maxPerHour: 5,
  rampMode: 'manual',
  guardrailsEnabled: true,
  guardrailThresholds: {
    minimumSampleSize: 50,
    increaseClaimClickRate: 0.2,
    holdClaimClickRateFloor: 0.1,
    pauseClaimClickRateFloor: 0.05,
    maxBounceComplaintRate: 0.02,
    maxUnsubscribeRate: 0.01,
    maxProviderFailureRate: 0.05,
  },
  queriesUsedToday: 12,
  autoIngestedToday: 3,
};

type Seed = (client: QueryClient) => void;

function withClient(seed: Seed): Decorator<Args> {
  return function WithClient(Story) {
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false, retryOnMount: false, staleTime: Infinity },
        mutations: { retry: false },
      },
    });
    seed(client);
    return (
      <QueryClientProvider client={client}>
        <Story />
      </QueryClientProvider>
    );
  };
}

const withSettings = withClient(client =>
  client.setQueryData(queryKeys.admin.leads.settings(), { settings: SETTINGS })
);

function withSettingsError(message: string) {
  return withClient(client => {
    client
      .getQueryCache()
      .build(client, { queryKey: queryKeys.admin.leads.settings() })
      .setState({
        status: 'error',
        fetchStatus: 'idle',
        error: new Error(message),
        errorUpdatedAt: 1,
      });
  });
}

function diagnostic(
  index: number,
  overrides: Partial<DiscoveryKeywordDiagnostic> = {}
): DiscoveryKeywordDiagnostic {
  return {
    keywordId: `keyword-${index}`,
    query: `site:linktr.ee "music" "spotify" ${index}`,
    rawResultCount: 10,
    linktreeUrlsFound: 4,
    newLeadsInserted: 2,
    duplicatesSkipped: 2,
    error: null,
    durationMs: 420,
    searchOffset: 11,
    ...overrides,
  };
}

function discoveryResult(
  diagnostics: DiscoveryKeywordDiagnostic[]
): DiscoveryResultResponse {
  return {
    queriesUsed: diagnostics.length,
    candidatesProcessed: diagnostics.length * 4,
    newLeadsFound: diagnostics.reduce((sum, d) => sum + d.newLeadsInserted, 0),
    duplicatesSkipped: diagnostics.reduce(
      (sum, d) => sum + d.duplicatesSkipped,
      0
    ),
    diagnostics,
    budgetRemaining: 88,
    keywordRotationIndex: diagnostics.length,
    totalEnabledKeywords: 24,
  };
}

function stubFetch(respond: () => Promise<Response>) {
  return () => {
    const realFetch = globalThis.fetch;
    globalThis.fetch = () => respond();
    return () => {
      globalThis.fetch = realFetch;
    };
  };
}

function serveDiscovery(diagnostics: DiscoveryKeywordDiagnostic[]) {
  return stubFetch(async () =>
    Response.json({ result: discoveryResult(diagnostics) })
  );
}

async function runDiscovery(canvasElement: HTMLElement) {
  const canvas = within(canvasElement);
  await userEvent.click(canvas.getByRole('button', { name: 'Run Discovery' }));
  await expect(
    await canvas.findByText('Discovery Diagnostics')
  ).toBeInTheDocument();
}

/** Loading: the pipeline settings have not arrived yet. */
export const LoadingSettings: Story = {
  decorators: [withClient(() => undefined)],
  beforeEach: stubFetch(() => new Promise<Response>(() => undefined)),
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText('Loading pipeline settings...')
    ).toBeInTheDocument();
  },
};

/** Error: the settings request failed and its message replaces the form. */
export const ErrorLoadingSettings: Story = {
  decorators: [withSettingsError('Pipeline settings are unavailable (500).')],
};

/** Offline: the settings request could not reach the server. */
export const OfflineSettings: Story = {
  decorators: [withSettingsError('Failed to fetch')],
};

/** Empty: discovery ran but Google returned nothing for any query. */
export const EmptyDiscoveryResults: Story = {
  decorators: [withSettings],
  beforeEach: serveDiscovery([
    diagnostic(1, {
      rawResultCount: 0,
      linktreeUrlsFound: 0,
      newLeadsInserted: 0,
      duplicatesSkipped: 0,
    }),
  ]),
  play: async ({ canvasElement }) => {
    await runDiscovery(canvasElement);
    await expect(
      within(canvasElement).getByText(
        'Google CSE returned 0 results for all queries'
      )
    ).toBeInTheDocument();
  },
};

/** Partial: some keyword queries failed while others found leads. */
export const PartialDiscoveryFailures: Story = {
  decorators: [withSettings],
  beforeEach: serveDiscovery([
    diagnostic(1),
    diagnostic(2, {
      error: 'Quota exceeded for this engine',
      rawResultCount: 0,
    }),
  ]),
  play: async ({ canvasElement }) => {
    await runDiscovery(canvasElement);
    await expect(
      within(canvasElement).getByText(
        'Some queries failed — check Sentry for details'
      )
    ).toBeInTheDocument();
  },
};

/** Long content: many keyword rows with long queries in the diagnostics. */
export const LongContentDiagnostics: Story = {
  decorators: [withSettings],
  beforeEach: serveDiscovery(
    Array.from({ length: 16 }, (_, index) =>
      diagnostic(index + 1, {
        query: `site:linktr.ee "independent electronic music producer" "spotify" "soundcloud" ${index + 1}`,
        rawResultCount: 1_240 + index,
      })
    )
  ),
  play: async ({ canvasElement }) => {
    await runDiscovery(canvasElement);
  },
};

const withRtl: Decorator<Args> = function WithRtl(Story) {
  return (
    <div dir='rtl' lang='ar'>
      <Story />
    </div>
  );
};

/** RTL: the settings form inside a right-to-left admin page. */
export const RtlSettings: Story = {
  decorators: [withRtl, withSettings],
};
