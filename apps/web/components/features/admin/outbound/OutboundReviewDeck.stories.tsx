import '@/styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import type { OutreachEngineStatus } from '@/lib/outbound/cold/engine-types';
import { OutboundReviewDeck } from './OutboundReviewDeck';
import { outboundFixtureRow } from './outbound-fixtures';

const rows = [
  outboundFixtureRow({
    view: 'certified',
    nextAction: 'approve_message',
    certified: true,
  }),
  outboundFixtureRow({
    leadId: '00000000-0000-4000-8000-000000000002',
    name: 'Bea',
    handle: 'bea',
    view: 'certified',
    nextAction: 'approve_message',
    certified: true,
  }),
];

const engine: OutreachEngineStatus = {
  schema: 'outreach-engine/v1',
  generatedAt: '2026-10-29T12:00:00.000Z',
  learning: [
    {
      segment: 'email:recent_release',
      templateVersion: 'cold-draft/v1',
      reviewed: 18,
      approved: 16,
      approvedUnchanged: 11,
      unchangedRate: 11 / 18,
      editDistanceP50: 0,
      editDistanceP95: 0.42,
      rejectReasons: { too_big: 1, wrong_artifact: 1 },
      categories: { unchanged: 11, cut: 4, subject: 2 },
    },
  ],
  autoApprove: [
    {
      segment: 'email:recent_release',
      mode: 'review',
      blocks: ['too_few_reviews', 'deliverability_unknown'],
      summary:
        'Review: 11 of 18 approved unchanged; needs 50 with no edits at p95.',
    },
  ],
  styleGuide: { avoid: [], prefer: [], basedOn: 5 },
  controller: {
    state: 'blocked',
    blockers: ['cold_domain_missing', 'mailing_address_missing'],
    blockerLabels: [
      'No cold domain approved yet',
      'Mailing address not set (JOV-9648)',
    ],
    dialTarget: 10,
    capacityToday: 0,
    budgetToday: 0,
    inboxes: [],
    incidents: [],
  },
  funnel: [],
};

const meta: Meta<typeof OutboundReviewDeck> = {
  title: 'Admin/Outbound/OutboundReviewDeck',
  component: OutboundReviewDeck,
  parameters: { layout: 'fullscreen' },
  args: {
    rows,
    engine,
    pending: null,
    error: null,
    onApprove: fn(async () => {}),
    onReject: fn(async () => {}),
    onExit: fn(),
  },
};
export default meta;

type Story = StoryObj<typeof OutboundReviewDeck>;

export const Default: Story = {};
export const Loading: Story = { args: { engine: undefined } };
export const Approving: Story = { args: { pending: 'approve' } };
export const Refused: Story = {
  args: {
    error:
      'This person changed since you opened them. Review the refreshed row.',
  },
};
export const Empty: Story = { args: { rows: [] } };
