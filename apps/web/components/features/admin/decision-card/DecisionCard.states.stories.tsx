import '@/styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { DecisionCard } from './DecisionCard';
import { DECISION_CARD_STORY_STATES, LAYOUT_VIEW } from './fixtures';

/** State coverage for the Ovie decision card. */
const meta = {
  title: 'Features/Admin/DecisionCard States',
  component: DecisionCard,
  parameters: { layout: 'padded', backgrounds: { default: 'dark' } },
  decorators: [
    function MetaDecorator(Story) {
      return (
        <ContentSurfaceCard className='max-w-xl'>
          <div className='p-4'>
            <Story />
          </div>
        </ContentSurfaceCard>
      );
    },
  ],
  args: {
    discussHref: '/app/ov/chat?discuss=summer-card%3Asc_ef84c09c',
    onApprove: fn(),
    onReject: fn(),
    onRetry: fn(),
    ...DECISION_CARD_STORY_STATES.Pending,
  },
} satisfies Meta<typeof DecisionCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: a decision with no default, facts or evidence filed yet. */
export const EmptyFactsAndEvidence: Story = {
  args: {
    view: {
      ...LAYOUT_VIEW,
      fallback: null,
      waiting: null,
      facts: [],
      evidence: [],
    },
  },
};

/** Partial: no default and no reject path; the card shows how long it waited. */
export const PartialNoRejectPath: Story = {
  args: {
    view: {
      ...LAYOUT_VIEW,
      fallback: null,
      waiting: { hours: 26, level: 1 },
      evidence: [],
    },
    onReject: undefined,
    approveLabel: 'Ship It',
  },
};

const LONG_FACT =
  'This deliberately long fact explains the trade-off behind the decision in enough detail that it has to clamp to two lines inside the card without pushing the actions out of their fixed slot.';

/** Long content: a long decision, a long default summary and long facts. */
export const LongContentDecision: Story = {
  args: {
    view: {
      ...LAYOUT_VIEW,
      decision:
        'Put the open asks above the pulse on Ovie Home and move the shipping strip under the fold for every founder account',
      fallback: {
        ...LAYOUT_VIEW.fallback!,
        summary: LONG_FACT,
      },
      facts: [LONG_FACT, LONG_FACT.replace('This', 'A second'), 'Short fact'],
    },
  },
};

/** Offline: the write never reached the server; the card keeps Retry. */
export const OfflineWriteFailed: Story = {
  args: {
    view: LAYOUT_VIEW,
    status: { kind: 'error', message: 'Offline. Not recorded. Retry.' },
  },
};

/** Right-to-left: the card inside an RTL document. */
export const RtlDocument: Story = {
  args: {
    view: {
      ...LAYOUT_VIEW,
      decision: 'ضع الطلبات المفتوحة فوق النبض في الصفحة الرئيسية',
    },
  },
  decorators: [
    function RtlDocumentDecorator(Story) {
      return (
        <div dir='rtl'>
          <Story />
        </div>
      );
    },
  ],
};
