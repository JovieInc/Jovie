import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import type { ContactCertificationInspection } from '@/lib/contacts/certification';
import { OutboundRailReadiness } from './OutboundRailReadiness';
import { outboundFixtureRow } from './outbound-fixtures';

const certified: ContactCertificationInspection = {
  evidenceRevision: 'synthetic',
  status: 'certified_for_outreach',
  canCertify: true,
  items: [],
  coverage: {
    confirmed: 1,
    rejected: 0,
    unresolved: 0,
    stale: 0,
    sourceClassesChecked: ['identity'],
    missingSourceClasses: [],
  },
};

const meta = {
  title: 'Admin/Outbound/Rail readiness/States',
  component: OutboundRailReadiness,
  parameters: { layout: 'centered' },
  args: {
    row: outboundFixtureRow(),
    certification: certified,
    loading: false,
    pending: null,
    error: null,
    onRefreshEvidence: fn(),
    onCertify: fn(),
    onReviewFacts: fn(),
    onReviewMessage: fn(),
  },
  decorators: [
    function RailFrame(Story) {
      return (
        <div className='w-80'>
          <Story />
        </div>
      );
    },
  ],
} satisfies Meta<typeof OutboundRailReadiness>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Loading: current facts are still being read. */
export const LoadingFacts: Story = {
  args: { certification: null, loading: true },
};

/** Empty: certified facts leave no blockers to list. */
export const EmptyNoBlockers: Story = {};

/** Error: an action was refused and is announced in the summary. */
export const ErrorActionRefused: Story = {
  args: { error: 'Approval refused: facts changed since certification.' },
};

/** Partial: some facts are stale or unresolved. */
export const PartialStaleFacts: Story = {
  args: {
    certification: {
      ...certified,
      status: 'stale',
      coverage: { ...certified.coverage, stale: 2, unresolved: 1 },
    },
  },
};

/** Long content: many missing evidence classes and a long error. */
export const LongContentBlockers: Story = {
  args: {
    error:
      'Approval refused: the certified facts changed since the last review and every dependent fact needs to be reviewed again before outreach.',
    certification: {
      ...certified,
      status: 'conflicted',
      coverage: {
        ...certified.coverage,
        missingSourceClasses: [
          'official-site',
          'streaming-profile',
          'social-profile',
          'press-coverage',
        ],
      },
    },
  },
};

/** Rtl: the readiness rail in a right-to-left drawer. */
export const RtlRail: Story = {
  decorators: [
    function RtlFrame(Story) {
      return (
        <div dir='rtl'>
          <Story />
        </div>
      );
    },
  ],
};
