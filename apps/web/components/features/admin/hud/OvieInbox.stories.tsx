import '@/styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode, useEffect, useState } from 'react';
import { fixtureInventory } from '@/lib/ovie/certifications/fixtures';
import type { OvieInbox as Inbox } from '@/lib/ovie/inbox';
import { projectOvieInbox } from '@/lib/ovie/inbox';
import type { SummerCard } from '@/lib/ovie/summer-cards';
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
      decisionDefault: null,
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

export const Certification: Story = {
  decorators: withInbox(projectOvieInbox([], [], fixtureInventory())),
};

const liveCard = (overrides: Partial<SummerCard>): SummerCard => ({
  id: 'sc_ef84c09cfecc65ece5e7bfdbda9443fc',
  idempotencyKey: 'mvp-pricing-v1-20261029',
  kind: 'decision',
  product: 'jov',
  title:
    'MVP pricing: Artist Presence $19/mo, $190/yr once release emails are proven',
  body: 'Artist Presence paid plan: new payers $19/mo or $190/yr (two months free), only after the automatic release email has at least one production delivery receipt (today: 0 rows ever). $12 subscribers keep $12 for life. Free stays free. Archive the retired live prices with 0 subscribers (price_1TG8IWAAI1NrDqJSGT7nzvRF, price_1TG8IXAAI1NrDqJSfBjRhWrl, price_1TG8IVAAI1NrDqJS2VVD5S09, price_1TG8IVAAI1NrDqJSdOxWro1y); leave the $199 price for its 1 subscriber. Make the new price the product default.\n\nAlternatives: keep $12 (below comparables — Feature.fm Artist $19, Laylo Pro $25); jump to $29 now (no certified AI workflow yet).\n\nDefault if silent: apply on 2026-10-31 18:00 PT. If no release-email delivery receipt exists by then, keep $12 and re-check daily.',
  recommendation:
    'Approve: new payers $19/mo or $190/yr once release emails are proven; $12 kept for life for existing payers; archive the four zero-subscriber live prices; $299 done-for-you stays founder-sold by invoice until 3 deliveries with receipts.',
  defaultIfSilent:
    'Apply the recommendation (including archiving the empty live prices) on 2026-10-31 18:00 PT; if no release-email delivery receipt exists by then, keep $12 and re-check daily.',
  recipient: null,
  amountUsd: null,
  evidence: [
    'https://linear.app/jovie/issue/JOV-9769/founder-card-mvp-pricing-artist-presence-dollar19mo-or-dollar190yr',
    'https://github.com/JovieInc/Jovie/pull/23570',
  ],
  status: 'pending',
  comment: null,
  // Relative to the clock the countdown reads, so the story stays "in 31h".
  createdAt: new Date(Date.now() - 17 * 3_600_000).toISOString(),
  decidedAt: null,
  decideBy: new Date(Date.now() + 31 * 3_600_000).toISOString(),
  defaultDecision: 'reject',
  resolution: null,
  feedback: [],
  feedbackAt: null,
  ...overrides,
});

/** The live pricing card exactly as filed (legacy copy, before the contract). */
export const SummerLegacyCard: Story = {
  decorators: withInbox(projectOvieInbox([], [liveCard({})], null)),
};

/** The same decision filed to the copy contract. */
export const SummerContractCard: Story = {
  decorators: withInbox(
    projectOvieInbox(
      [],
      [
        liveCard({
          title: 'Price Artist Presence at $19/mo or $190/yr',
          defaultDecision: 'approve',
          defaultIfSilent:
            'New payers only, once a release email has a delivery receipt.',
          facts: [
            'Comparables: Feature.fm Artist $19, Laylo Pro $25',
            'Existing $12 payers keep $12 for life',
            'Archives four live prices with zero subscribers',
          ],
        }),
      ],
      null
    )
  ),
};
