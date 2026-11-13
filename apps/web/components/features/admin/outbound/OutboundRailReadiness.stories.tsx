import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { OutboundRailReadiness } from './OutboundRailReadiness';
import { outboundFixtureRow } from './outbound-fixtures';

const meta = {
  title: 'Admin/Outbound/Rail readiness',
  component: OutboundRailReadiness,
  args: {
    row: outboundFixtureRow(),
    certification: null,
    loading: false,
    pending: null,
    error: null,
    onRefreshEvidence: fn(),
    onCertify: fn(),
    onReviewFacts: fn(),
    onReviewMessage: fn(),
  },
} satisfies Meta<typeof OutboundRailReadiness>;
export default meta;
export const Unknown: StoryObj<typeof meta> = {};

export const ActionFailed: StoryObj<typeof meta> = {
  args: { error: 'Approval refused: facts changed since certification.' },
};
