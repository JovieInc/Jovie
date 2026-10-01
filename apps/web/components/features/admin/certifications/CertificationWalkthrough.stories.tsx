import { TooltipProvider } from '@jovie/ui';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import {
  fixturePacket,
  fixtureReceipt,
  fixtureRow,
} from '@/lib/ovie/certifications/fixtures';
import type { OvieCertificationDecisionKind } from '@/lib/ovie/certifications/types';
import { CertificationWalkthrough } from './CertificationWalkthrough';

const imageEvidence = fixtureRow('signup-golden-path');
const videoEvidence = fixtureRow('checkout-happy-path', {
  packet: fixturePacket('checkout-happy-path', {
    visualProof: [
      fixtureReceipt(
        'visual_proof',
        'checkout-happy-path-visual',
        'passed',
        'https://example.test/proof.webm'
      ),
    ],
  }),
});

const meta = {
  title: 'Features/Admin/Certifications/CertificationWalkthrough',
  component: CertificationWalkthrough,
  parameters: {
    layout: 'fullscreen',
    viewport: { defaultViewport: 'desktop' },
  },
  decorators: [
    Story => (
      <TooltipProvider>
        <div className='min-h-180 bg-(--app-shell-content-surface) text-primary-token'>
          <Story />
        </div>
      </TooltipProvider>
    ),
  ],
  args: {
    row: imageEvidence,
    open: true,
    onOpenChange: fn(),
    onDecide: fn(
      async (decision: OvieCertificationDecisionKind, notes: string | null) => {
        void decision;
        void notes;
      }
    ),
    pendingDecision: null,
  },
} satisfies Meta<typeof CertificationWalkthrough>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ImageEvidence: Story = {};

export const VideoEvidence: Story = {
  args: { row: videoEvidence },
};

export const DecisionPending: Story = {
  args: { pendingDecision: 'approved' },
};
