import '@/styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
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
