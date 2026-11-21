import '@/styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';
import type { OvieInbox as Inbox, OvieInboxCase } from '@/lib/ovie/inbox';
import { OvieInbox } from './OvieInbox';

const INBOX_KEY = ['ovie', 'inbox'];

const reviewCase: OvieInboxCase = {
  contract: 'jovie.interaction-case/v1',
  id: 'review:release',
  kind: 'certification',
  source: { system: 'certification', id: 'release', revision: 'evidence-v1' },
  title: 'Review the release announcement',
  body: 'The announcement is ready. Review the copy and evidence before approving.',
  recommendation: 'Approve the current draft after checking the release date.',
  owner: 'founder',
  state: 'needs_you',
  priority: 2,
  createdAt: '2026-10-02T12:00:00Z',
  nextAction: 'Review',
  waitingUntil: null,
  decisionDefault: null,
  confidence: null,
  evidence: ['https://example.com/release-proof'],
  decisionTarget: {
    kind: 'certification',
    id: 'release',
    evidenceDigest: 'evidence-v1',
  },
};

function Fixture({
  children,
  data,
  dir = 'ltr',
}: Readonly<{
  children: ReactNode;
  data?: Inbox;
  dir?: 'ltr' | 'rtl';
}>) {
  const [client] = useState(() => {
    const result = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    if (data) result.setQueryData(INBOX_KEY, data);
    return result;
  });
  return (
    <QueryClientProvider client={client}>
      <div dir={dir} className='max-w-3xl p-4'>
        {children}
      </div>
    </QueryClientProvider>
  );
}

/** Answers the inbox request for one story; nothing reaches the API. */
function stubInbox(answer: () => Promise<Response>) {
  return () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      const url = new URL(String(input), window.location.href);
      if (url.pathname === '/api/ovie/inbox') return answer();
      return originalFetch(input, init);
    };
    return () => {
      globalThis.fetch = originalFetch;
    };
  };
}

function withInbox(
  data: Inbox | undefined,
  dir: 'ltr' | 'rtl' = 'ltr'
): NonNullable<Story['decorators']> {
  return [
    Story => (
      <Fixture data={data} dir={dir}>
        <Story />
      </Fixture>
    ),
  ];
}

const meta = {
  title: 'Features/Admin/Hud/OvieInbox/States',
  component: OvieInbox,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof OvieInbox>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Error: the inbox request fails, so the card offers a retry. */
export const ErrorLoadFailed: Story = {
  beforeEach: stubInbox(async () => new Response('nope', { status: 500 })),
  decorators: withInbox(undefined),
};

/** Long content: a title and body far past the scroll port height. */
export const LongContent: Story = {
  decorators: withInbox({
    cases: [
      {
        ...reviewCase,
        title:
          'Review the release announcement for every artist on the label roster before the Friday drop',
        body: 'The announcement is ready. '.repeat(40),
      },
    ],
    issues: [],
  }),
};

/** Offline: the network is down, so the read rejects. */
export const Offline: Story = {
  beforeEach: stubInbox(async () => {
    throw new TypeError('Failed to fetch');
  }),
  decorators: withInbox(undefined),
};

/** PermissionDenied: the operator session lacks access to the inbox. */
export const PermissionDenied: Story = {
  beforeEach: stubInbox(async () => new Response('Forbidden', { status: 403 })),
  decorators: withInbox(undefined),
};

/** Rtl: right-to-left layout keeps the header and notes field aligned. */
export const RtlOverflow: Story = {
  decorators: withInbox({ cases: [reviewCase], issues: [] }, 'rtl'),
};
