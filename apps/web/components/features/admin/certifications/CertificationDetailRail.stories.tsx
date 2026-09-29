import { TooltipProvider } from '@jovie/ui';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import {
  fixtureInventory,
  fixturePacket,
  fixtureReceipt,
  fixtureRow,
} from '@/lib/ovie/certifications/fixtures';
import { CertificationDetailRail } from './CertificationDetailRail';

const reviewReady = fixtureRow('signup-golden-path');
const blocked = fixtureRow('claim-profile', {
  packet: fixturePacket('claim-profile', {
    visualProof: [fixtureReceipt('visual_proof', 'claim-visual', 'failed')],
  }),
});
const certified = fixtureInventory().rows[2] ?? null;

const meta = {
  title: 'Features/Admin/Certifications/CertificationDetailRail',
  component: CertificationDetailRail,
  parameters: { layout: 'fullscreen' },
  decorators: [
    Story => (
      <TooltipProvider>
        <div className='flex min-h-180 justify-end bg-(--app-shell-content-surface) text-primary-token'>
          <Story />
        </div>
      </TooltipProvider>
    ),
  ],
  args: {
    row: reviewReady,
    onClose: fn(),
    onDecide: fn(async () => undefined),
    pendingDecision: null,
    decisionError: null,
  },
} satisfies Meta<typeof CertificationDetailRail>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ReviewReady: Story = {};

export const Blocked: Story = {
  args: { row: blocked },
};

export const Certified: Story = {
  args: { row: certified },
};

export const DecisionError: Story = {
  args: {
    decisionError: 'The evidence changed since this page loaded.',
  },
};

export const Empty: Story = {
  args: { row: null },
};
