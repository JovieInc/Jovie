import '@/styles/system-b-app.css';
import { Button } from '@jovie/ui';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { type ComponentProps, useState } from 'react';
import { fn } from 'storybook/test';
import type { ContactCertificationInspection } from '@/lib/contacts/certification';
import { OutboundRail } from './OutboundRail';
import { outboundFixtureRow } from './outbound-fixtures';

function certification(
  status: ContactCertificationInspection['status']
): ContactCertificationInspection {
  const unresolved = status === 'needs_review';
  return {
    evidenceRevision: 'evidence-revision-1',
    status,
    canCertify: !unresolved,
    coverage: {
      confirmed: unresolved ? 1 : 2,
      rejected: 0,
      unresolved: unresolved ? 1 : 0,
      stale: 0,
      sourceClassesChecked: ['identity'],
      missingSourceClasses: unresolved ? ['dsp'] : [],
    },
    items: [
      {
        key: 'canonical:display-name',
        revision: 'evidence-revision-1',
        category: 'identity',
        label: 'Display name',
        value: 'Ada',
        url: null,
        source: 'lead, profile',
        observedAt: '2026-10-01T00:00:00.000Z',
        confidence: 0.9,
        rationale: 'Joined across the lead and the built profile.',
        freshness: 'fresh',
        decision: 'yes',
      },
      {
        key: 'canonical:email',
        revision: 'evidence-revision-1',
        category: 'identity',
        label: 'Contact email',
        value: 'ada@example.com',
        url: null,
        source: 'linktree',
        observedAt: '2026-10-01T00:00:00.000Z',
        confidence: 0.7,
        rationale: 'Listed on the public link page.',
        freshness: 'fresh',
        decision: unresolved ? null : 'yes',
      },
    ],
  };
}

const meta: Meta<typeof OutboundRail> = {
  title: 'Admin/Outbound/Rail',
  component: OutboundRail,
  parameters: {
    layout: 'fullscreen',
    jovie: {
      // `item` belongs to the reused EvidenceItemCard, rendered from certification.items.
      uncoveredProps: ['item'],
    },
  },
  decorators: [
    Story => (
      <div className='flex h-screen justify-end bg-base text-primary-token'>
        <Story />
      </div>
    ),
  ],
  args: {
    row: outboundFixtureRow(),
    certification: certification('needs_review'),
    certificationLoading: false,
    activeFactKey: 'canonical:email',
    pending: null,
    error: null,
    onClose: fn(),
    onFact: fn(async () => {}),
    onCertify: fn(),
    onRefreshEvidence: fn(),
    onApprove: fn(),
    onSaveCopy: fn(),
    onHold: fn(),
    onReject: fn(),
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const NeedsReview: Story = {};

export const ReadyToApprove: Story = {
  args: {
    certification: certification('certified_for_outreach'),
    activeFactKey: null,
  },
};

export const LoadingFacts: Story = {
  args: { certification: null, certificationLoading: true },
};

export const DecisionFailed: Story = {
  args: {
    certification: certification('certified_for_outreach'),
    pending: null,
    error: 'Approval refused: facts changed since certification.',
  },
};

export const Empty: Story = {
  args: { row: null, certification: null },
};

export const NeedsJudge: Story = {
  args: {
    row: outboundFixtureRow({
      view: 'needs_judge',
      nextAction: 'await_judge',
      message: null,
    }),
    certification: certification('certified_for_outreach'),
    activeFactKey: null,
  },
};

export const ColdDraftUnavailable: Story = {
  args: {
    row: outboundFixtureRow({
      view: 'flagged',
      nextAction: 'review_facts',
      flags: ['cold_draft_unavailable'],
      message: null,
    }),
    certification: certification('certified_for_outreach'),
    activeFactKey: null,
  },
};

export const NoProfile: Story = {
  args: {
    row: outboundFixtureRow({
      profilePath: null,
      message: null,
      channel: null,
      view: 'needs_evidence',
      missingEvidence: ['identity', 'dsp', 'catalog', 'search', 'reachability'],
    }),
    certification: null,
    activeFactKey: null,
  },
};
export const NoReachability: Story = {
  args: {
    row: outboundFixtureRow({ channel: null, message: null }),
    certification: certification('certified_for_outreach'),
    activeFactKey: null,
  },
};
export const StaleFacts: Story = {
  args: {
    row: outboundFixtureRow({
      view: 'needs_evidence',
      message: null,
      missingEvidence: ['dsp', 'catalog'],
    }),
    certification: {
      ...certification('stale'),
      canCertify: false,
      coverage: {
        ...certification('needs_review').coverage,
        unresolved: 3,
        stale: 2,
        rejected: 1,
        missingSourceClasses: ['dsp', 'catalog'],
      },
    },
    activeFactKey: null,
  },
};
export const Rejected: Story = {
  args: {
    row: outboundFixtureRow({
      view: 'rejected',
      message: null,
      approval: {
        ...outboundFixtureRow().approval,
        target: 'rejected',
        rejectReason: 'wrong_person',
      },
    }),
    certification: certification('certified_for_outreach'),
    activeFactKey: null,
  },
};
export const Held: Story = {
  args: {
    row: outboundFixtureRow({ view: 'held', message: null }),
    certification: certification('certified_for_outreach'),
    activeFactKey: null,
  },
};
export const Sent: Story = {
  args: {
    row: outboundFixtureRow({ view: 'sent' }),
    certification: certification('certified_for_outreach'),
    activeFactKey: null,
  },
};
export const LongNameEvidence: Story = {
  args: {
    row: outboundFixtureRow({
      name: 'Ada and the Midnight Orchestra',
      message: null,
    }),
    certification: {
      ...certification('needs_review'),
      items: [
        {
          ...certification('needs_review').items[0],
          value:
            'Ada and the Midnight Orchestra | Instagram, Spotify, YouTube, Live Tickets & Official Merch',
          decision: null,
        },
      ],
    },
    activeFactKey: 'canonical:display-name',
  },
};
function PersonNavigation(args: ComponentProps<typeof OutboundRail>) {
  const [person, setPerson] = useState(0);
  const name = ['Ada', 'Bea', 'Cy'][person % 3];
  const facts = certification('needs_review');
  return (
    <>
      <Button size='sm' onClick={() => setPerson(value => value + 1)}>
        Next Person
      </Button>
      <OutboundRail
        {...args}
        row={outboundFixtureRow({
          leadId: `synthetic-person-${person}`,
          name,
          message: {
            channel: 'email',
            subject: `${name} subject`,
            body: `${name} draft`,
            revision: null,
          },
        })}
        certification={{
          ...facts,
          items: facts.items.map(item => ({
            ...item,
            value:
              item.key === 'canonical:display-name'
                ? `${name} | Instagram, Spotify`
                : `${name.toLowerCase()}@example.com`,
          })),
        }}
      />
    </>
  );
}
export const RapidPersonNavigation: Story = {
  render: args => <PersonNavigation {...args} />,
};
