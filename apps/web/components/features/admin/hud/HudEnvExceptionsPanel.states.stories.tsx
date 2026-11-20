import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import type {
  HudEnvActiveException,
  HudEnvExceptionLane,
  HudEnvExceptionsPayload,
} from '@/types/hud-env-exceptions';
import { HudEnvExceptionsPanel } from './HudEnvExceptionsPanel';

const QUERY_KEY = ['hud', 'env-exceptions'];
const ENV_PATH = '/api/admin/hud/env-exceptions';

const entry: HudEnvActiveException = {
  id: 'pr-17166',
  kind: 'vercel-preview',
  workId: 'JOV-5941',
  sha: 'b4f93e3a9d6e201825aedc09d8d0dfc055e7d082',
  owner: 'itstimwhite',
  reason: 'Manual hosted preview for a supervisor walkthrough',
  requiredEvidence: 'manual-dispatch',
  environment: 'jovie-git-pr-17166',
  createdAt: '2026-09-04T01:10:00.000Z',
  expiresAt: '2026-09-05T01:10:00.000Z',
  ageMs: 45 * 60_000,
  expiresInMs: 2 * 3_600_000,
  expired: false,
  countsAsEvidence: false,
  cleanupState: 'cleanup-pending',
  costBudget: '$0.50',
  blocker: false,
  blockerReason: null,
};

const lane: HudEnvExceptionLane = {
  id: 'ci-neon-db',
  kind: 'neon-branch',
  policy: 'ephemeral-2h',
  owner: 'owl',
  surface: 'ci',
  evidencePurpose: 'migration proof',
  ttlHours: 2,
  cleanupTrigger: 'pr-close',
  costBudget: '$0.00',
};

function payload(
  activeExceptions: HudEnvActiveException[],
  lanes: HudEnvExceptionLane[]
): HudEnvExceptionsPayload {
  return {
    schema: 'jovie-hud-env-exceptions/v1',
    generatedAt: '2026-09-04T02:00:00.000Z',
    updatedBy: 'neon-scheduled-cleanup',
    lanes,
    activeExceptions,
  };
}

/** Answers the env-exceptions request for one story; nothing reaches the API. */
function stubEnvExceptions(answer: () => Promise<Response>) {
  return () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      const url = new URL(String(input), window.location.href);
      if (url.pathname === ENV_PATH) return answer();
      return originalFetch(input, init);
    };
    return () => {
      globalThis.fetch = originalFetch;
    };
  };
}

const answerWith = (data: HudEnvExceptionsPayload) => async () =>
  Response.json(data);

interface PanelStoryProps {
  readonly seed?: HudEnvExceptionsPayload;
  readonly dir?: 'ltr' | 'rtl';
}

function PanelStory({ seed, dir = 'ltr' }: PanelStoryProps) {
  const [client] = useState(() => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    if (seed) queryClient.setQueryData(QUERY_KEY, seed);
    return queryClient;
  });
  return (
    <QueryClientProvider client={client}>
      <div dir={dir} className='w-full max-w-md'>
        <HudEnvExceptionsPanel />
      </div>
    </QueryClientProvider>
  );
}

const meta = {
  title: 'Features/Admin/Hud/HudEnvExceptionsPanel States',
  component: HudEnvExceptionsPanel,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof HudEnvExceptionsPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

function renderUnseeded() {
  return <PanelStory />;
}

/** Loading: the request never answers, so the panel holds its skeleton. */
export const LoadingPanel: Story = {
  beforeEach: stubEnvExceptions(() => new Promise<Response>(() => {})),
  render: renderUnseeded,
};

const emptyPayload = payload([], []);

function renderEmpty() {
  return <PanelStory seed={emptyPayload} />;
}

/** Empty: no active exceptions and no standing lanes. */
export const EmptyNoExceptions: Story = {
  beforeEach: stubEnvExceptions(answerWith(emptyPayload)),
  render: renderEmpty,
};

/** Error: the API answers 500, so the panel shows Unavailable with Retry. */
export const ErrorUnavailable: Story = {
  beforeEach: stubEnvExceptions(
    async () => new Response('error', { status: 500 })
  ),
  render: renderUnseeded,
};

/** Offline: the request cannot leave the browser; same recoverable status. */
export const OfflineRequestFailed: Story = {
  beforeEach: stubEnvExceptions(async () => {
    throw new TypeError('Failed to fetch');
  }),
  render: renderUnseeded,
};

const longPayload = payload(
  Array.from({ length: 6 }, (_, index) => ({
    ...entry,
    id: `pr-${17160 + index}`,
    workId: `JOV-${5940 + index}-release-day-router-preview-environment`,
    owner: 'a-very-long-owner-handle-for-the-release-automation-agent',
    environment: `jovie-git-claude-release-day-router-preview-${17160 + index}`,
    reason:
      'Manual hosted preview kept alive past its window so the supervisor can walk the full release-day flow with real distributor callbacks before the cleanup job reclaims the database branch.',
    requiredEvidence: 'manual-dispatch plus a recorded supervisor walkthrough',
    ageMs: 53 * 3_600_000 + 12 * 60_000,
    expiresInMs: -(7 * 3_600_000 + 5 * 60_000),
    expired: true,
    cleanupState: index % 2 === 0 ? 'orphaned' : 'cleanup-pending',
    blocker: index % 2 === 0,
    blockerReason:
      index % 2 === 0
        ? 'Expired without a cleanup receipt, and the preview database branch still accepts writes from the walkthrough account.'
        : null,
  })),
  Array.from({ length: 4 }, (_, index) => ({
    ...lane,
    id: `ci-neon-db-lane-${index + 1}-for-migration-proof-runs`,
    cleanupTrigger:
      'pr-close or the nightly scheduled cleanup, whichever first',
  }))
);

function renderLong() {
  return <PanelStory seed={longPayload} />;
}

/** Long content: six long rows, three blockers and four standing lanes. */
export const LongContentManyExceptions: Story = {
  beforeEach: stubEnvExceptions(answerWith(longPayload)),
  render: renderLong,
};

const rtlPayload = payload(
  [
    {
      ...entry,
      owner: 'فريق المنصة',
      reason: 'معاينة مستضافة يدوية لجولة المشرف قبل يوم الإصدار',
      cleanupState: 'orphaned',
      blocker: true,
      blockerReason: 'انتهت الصلاحية دون إيصال تنظيف',
    },
  ],
  [lane]
);

function renderRtl() {
  return <PanelStory seed={rtlPayload} dir='rtl' />;
}

/** RTL: Arabic owner, reason and blocker copy in a right-to-left container. */
export const RtlArabicReason: Story = {
  beforeEach: stubEnvExceptions(answerWith(rtlPayload)),
  render: renderRtl,
};
