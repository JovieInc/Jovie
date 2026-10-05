import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode, useEffect, useState } from 'react';
import type { OvieInbox as Inbox } from '@/lib/ovie/inbox';
import { OvieInbox } from './OvieInbox';

const pending: Inbox = {
  cases: [
    {
      contract: 'jovie.interaction-case/v1',
      id: 'review:release',
      kind: 'certification',
      source: {
        system: 'certification',
        id: 'release',
        revision: 'evidence-v1',
      },
      title: 'Review the release announcement',
      body: 'The announcement is ready. Review the copy and evidence before approving.',
      recommendation:
        'Approve the current draft after checking the artist names and release date.',
      owner: 'founder',
      state: 'needs_you',
      priority: 2,
      createdAt: '2026-10-02T12:00:00Z',
      nextAction: 'Review',
      waitingUntil: null,
      confidence: null,
      evidence: ['https://example.com/release-proof'],
      decisionTarget: {
        kind: 'certification',
        id: 'release',
        evidenceDigest: 'evidence-v1',
      },
    },
  ],
  issues: [],
};

function Fixture({ children, data }: { children: ReactNode; data: Inbox }) {
  const [client] = useState(() => {
    const result = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    result.setQueryData(['ovie', 'inbox'], data);
    return result;
  });
  useEffect(() => {
    const apiWindow = window as Window & {
      __jovieApiMock?: (request: {
        url: URL;
        init?: RequestInit;
      }) => Response | undefined;
    };
    const previous = apiWindow.__jovieApiMock;
    apiWindow.__jovieApiMock = ({ url, init }) => {
      if (url.pathname === '/api/ovie/inbox') return Response.json(data);
      if (init?.method === 'POST') return new Response('{}', { status: 503 });
      return previous?.({ url, init });
    };
    return () => {
      apiWindow.__jovieApiMock = previous;
    };
  }, [data]);
  return (
    <QueryClientProvider client={client}>
      <div className='max-w-3xl p-4'>{children}</div>
    </QueryClientProvider>
  );
}

const meta = {
  title: 'Features/Admin/Hud/OvieInbox',
  component: OvieInbox,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof OvieInbox>;
export default meta;
type Story = StoryObj<typeof meta>;
function withInbox(data: Inbox): NonNullable<Story['decorators']> {
  return [
    Story => (
      <Fixture data={data}>
        <Story />
      </Fixture>
    ),
  ];
}
export const Pending: Story = { decorators: withInbox(pending) };
export const Empty: Story = {
  decorators: withInbox({ cases: [], issues: [] }),
};
export const IncompleteCoverage: Story = {
  decorators: withInbox({
    cases: [],
    issues: ['Customer inventory is not connected.'],
  }),
};
