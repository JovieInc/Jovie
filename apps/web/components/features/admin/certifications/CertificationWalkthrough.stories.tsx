import '@/styles/system-b-app.css';
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

/** Existing public capture, presented as a component fixture, not certification. */
export const PublicScreenshotRef: Story = {
  args: {
    row: fixtureRow('contact-page', {
      packet: fixturePacket('contact-page', {
        visualProof: [
          fixtureReceipt(
            'visual_proof',
            'contact-image',
            'passed',
            '/product-screenshots/tim-white-profile-contact-phone.png'
          ),
        ],
      }),
    }),
  },
};

export const MissingScreenshot: Story = {
  args: {
    row: fixtureRow('missing-proof', {
      packet: fixturePacket('missing-proof', {
        visualProof: [
          fixtureReceipt(
            'visual_proof',
            'missing-image',
            'passed',
            '/missing-certification-proof.png'
          ),
        ],
      }),
    }),
  },
};
