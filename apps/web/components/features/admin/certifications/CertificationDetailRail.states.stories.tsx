import { TooltipProvider } from '@jovie/ui';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { fixturePacket, fixtureRow } from '@/lib/ovie/certifications/fixtures';
import { CertificationDetailRail } from './CertificationDetailRail';

const reviewReady = fixtureRow('signup-golden-path');

/** Rendered states of the certification rail beyond its default stories. */
const meta = {
  title: 'Features/Admin/Certifications/CertificationDetailRail/States',
  component: CertificationDetailRail,
  parameters: { layout: 'fullscreen' },
  decorators: [
    function RailFrameDecorator(Story) {
      return (
        <TooltipProvider>
          <div className='flex min-h-180 justify-end bg-base text-primary-token'>
            <Story />
          </div>
        </TooltipProvider>
      );
    },
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

/** Loading: a Certify decision is in flight, so every action is locked. */
export const LoadingDecision: Story = {
  args: { pendingDecision: 'approved' },
};

/** Partial: no declared owner and no outside links on the row. */
export const PartialNoOwnerOrLinks: Story = {
  args: { row: { ...reviewReady, owner: null, links: [] } },
};

/** Long content: a long subject title and surface name in the header. */
export const LongContentTitle: Story = {
  args: {
    row: fixtureRow('long-golden-path', {
      surface: 'Golden Path onboarding across web, desktop and the iOS app',
      packet: fixturePacket('long-golden-path', {
        subject: {
          id: 'long-golden-path',
          kind: 'flow',
          title:
            'Sign up, claim a profile, connect Spotify and publish the first release page without leaving the guided flow',
        },
      }),
    }),
  },
};

/** Offline: the decision request never reached the server. */
export const OfflineDecision: Story = {
  args: {
    decisionError:
      'You are offline. The decision was not saved; try again when you reconnect.',
  },
};

/** Right-to-left: the rail inside an RTL document. */
export const RtlDocument: Story = {
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
