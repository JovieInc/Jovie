import '@/app/globals.css';
import '@/styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import type { OvieInbox } from '@/lib/ovie/inbox';
import { INTERACTION_CASE_CONTRACT } from '@/lib/ovie/interaction-case';
import { OvieHomeCanvas } from './OvieHomeCanvas';

type InboxCase = OvieInbox['cases'][number];

const spendCase: InboxCase = {
  contract: INTERACTION_CASE_CONTRACT,
  id: 'summer:vercel-concurrency',
  kind: 'spend',
  source: { system: 'summer', id: 'vercel-concurrency', revision: null },
  title: 'Vercel on-demand concurrency for Jovie',
  recommendation: 'About $6 a month, at most $44. Recommended.',
  owner: null,
  state: 'needs_you',
  priority: 1,
  createdAt: '2026-10-20T18:00:00.000Z',
  nextAction: null,
  waitingUntil: null,
  confidence: null,
  evidence: [],
  body: 'Gives production and staging builds their own lane so preview floods cannot stall production.',
  decisionTarget: { kind: 'summer', id: 'vercel-concurrency' },
};

type Answer = () => Promise<Response>;

const pending: Answer = () => new Promise<Response>(() => {});
const unavailable: Answer = async () => new Response('{}', { status: 503 });
const unreachable: Answer = async () => {
  throw new TypeError('Failed to fetch');
};
const inboxAnswer =
  (inbox: OvieInbox): Answer =>
  async () =>
    Response.json(inbox);

/**
 * Answers every Home read for one story. Shipping state and the company
 * sources stay unavailable unless the story says otherwise, so nothing
 * reaches the API.
 */
function stubHome(inbox: Answer, rest: Answer = unavailable) {
  return () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      const url = new URL(String(input), window.location.href);
      if (url.pathname === '/api/ovie/inbox') return inbox();
      if (url.pathname.startsWith('/api/')) return rest();
      return originalFetch(input, init);
    };
    return () => {
      globalThis.fetch = originalFetch;
    };
  };
}

function HomeFrame({ dir = 'ltr' }: { readonly dir?: 'ltr' | 'rtl' }) {
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false } } })
  );
  return (
    <QueryClientProvider client={client}>
      <div dir={dir} className='bg-base p-4 text-primary-token'>
        <OvieHomeCanvas />
      </div>
    </QueryClientProvider>
  );
}

function renderHome() {
  return <HomeFrame />;
}

const meta = {
  title: 'Features/Admin/Hud/OvieHomeCanvas States',
  component: OvieHomeCanvas,
  parameters: { layout: 'fullscreen' },
  render: renderHome,
} satisfies Meta<typeof OvieHomeCanvas>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Loading: no read has answered, so every section holds its skeleton. */
export const LoadingEverySection: Story = {
  beforeEach: stubHome(pending, pending),
};

/** Empty: the inbox answers with no cases, so nothing needs a decision. */
export const EmptyNoAsks: Story = {
  beforeEach: stubHome(inboxAnswer({ cases: [], issues: [] })),
};

/** Error: the inbox and every other source answer 503. */
export const ErrorDecisionsUnavailable: Story = {
  beforeEach: stubHome(unavailable),
};

/** Partial: asks load, but one inbox source is named as missing. */
export const PartialInboxSourceMissing: Story = {
  beforeEach: stubHome(
    inboxAnswer({
      cases: [spendCase],
      issues: ['Requested work is unavailable.'],
    })
  ),
};

/** Offline: no request can leave the browser. */
export const OfflineNothingReachable: Story = {
  beforeEach: stubHome(unreachable, unreachable),
};

const longCases: InboxCase[] = Array.from({ length: 6 }, (_, index) => ({
  ...spendCase,
  id: `summer:long-${index}`,
  source: { system: 'summer', id: `long-${index}`, revision: null },
  priority: index + 1,
  title: `Move the release-day smart link router to its own deployment lane so preview floods cannot stall production builds during a launch window (${index + 1})`,
  recommendation:
    'About $6 a month in the typical case and at most $44 in a month with back-to-back launches. Recommended, because the last stall cost five hours of production deploys.',
  body: 'Gives production and staging builds their own lane. Preview builds queue behind each other instead of behind production, and the cost only applies while more than one build is running at once.',
  decisionTarget: { kind: 'summer', id: `long-${index}` },
}));

/** Long content: six long asks; three show and the rest are deferred. */
export const LongContentManyAsks: Story = {
  beforeEach: stubHome(inboxAnswer({ cases: longCases, issues: [] })),
};

function renderRtl() {
  return <HomeFrame dir='rtl' />;
}

/** RTL: an Arabic ask in a right-to-left container. */
export const RtlArabicAsk: Story = {
  beforeEach: stubHome(
    inboxAnswer({
      cases: [
        {
          ...spendCase,
          title: 'مسار بناء مستقل للإنتاج على منصة النشر',
          recommendation:
            'حوالي ٦ دولارات شهريًا، وبحد أقصى ٤٤ دولارًا. موصى به.',
          body: 'يمنح الإنتاج مسارًا خاصًا حتى لا تعطله طلبات المعاينة.',
        },
      ],
      issues: [],
    })
  ),
  render: renderRtl,
};
