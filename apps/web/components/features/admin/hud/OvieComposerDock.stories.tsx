import '@/styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode, useEffect, useState } from 'react';
import type { OvieInbox as Inbox, OvieInboxCase } from '@/lib/ovie/inbox';
import { OvieComposerDock } from './OvieComposerDock';

function summerCase(id: string, title: string, evidence: string[] = []) {
  return {
    contract: 'jovie.interaction-case/v1',
    id: `summer:${id}`,
    kind: 'spend',
    source: { system: 'summer', id, revision: null },
    title,
    body: 'Exact proposal',
    recommendation: 'Approve the current draft.',
    owner: 'founder',
    state: 'needs_you',
    priority: 1,
    createdAt: '2026-10-02T12:00:00Z',
    nextAction: 'Review',
    waitingUntil: null,
    decisionDefault: null,
    confidence: null,
    evidence,
    decisionTarget: { kind: 'summer', id },
  } satisfies OvieInboxCase;
}

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
      <div className='max-w-2xl p-4'>{children}</div>
    </QueryClientProvider>
  );
}

const meta = {
  title: 'Features/Admin/Hud/OvieComposerDock',
  component: OvieComposerDock,
  parameters: { layout: 'fullscreen', backgrounds: { default: 'dark' } },
} satisfies Meta<typeof OvieComposerDock>;
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

export const Pending: Story = {
  decorators: withInbox({
    cases: [
      summerCase('one', 'Ship the release announcement to 214 followers'),
      summerCase('two', 'Spend $40 on the creator outreach test'),
    ],
    issues: [],
  }),
};
export const LongContent: Story = {
  decorators: withInbox({
    cases: [
      summerCase(
        'long',
        'Approve the weekend campaign that pauses the lowest-converting channel, moves its budget to the two best performing audiences, and re-runs the report on Monday morning'
      ),
    ],
    issues: [],
  }),
};
export const Empty: Story = {
  decorators: withInbox({ cases: [], issues: [] }),
};
