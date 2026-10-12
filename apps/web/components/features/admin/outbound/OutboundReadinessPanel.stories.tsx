import '@/styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { OutboundReadiness } from '@/lib/outbound/readiness';
import { OutboundReadinessPanel } from './OutboundReadinessPanel';

const outboundReadinessFixture: OutboundReadiness = {
  generatedAt: '2026-10-04T12:00:00Z',
  ready: 1,
  total: 3,
  items: [
    {
      id: 'certifications',
      label: 'Certifications cleared',
      status: 'green',
      detail: 'No people waiting on fact review',
      owner: 'outbound',
      href: null,
    },
    {
      id: 'cone',
      label: 'Revenue cone: acquisition eligible',
      status: 'red',
      detail: '1 of 8 receipts not green',
      owner: 'revenue',
      href: null,
      children: [
        {
          id: 'cone:payment_entitlement',
          label: 'Golden Path',
          status: 'red',
          detail: 'Fix the Golden Path lane failure.',
          owner: 'billing',
          href: 'https://linear.app/jovie/issue/JOV-7192',
        },
      ],
    },
    {
      id: 'production',
      label: 'Production is current',
      status: 'unknown',
      detail: 'Build info unavailable',
      owner: 'release',
      href: null,
    },
  ],
};

const meta: Meta<typeof OutboundReadinessPanel> = {
  title: 'Admin/Outbound/Readiness',
  component: OutboundReadinessPanel,
  parameters: { layout: 'fullscreen' },
  decorators: [
    Story => (
      <div className='bg-base text-primary-token'>
        <Story />
      </div>
    ),
  ],
  args: {
    readiness: outboundReadinessFixture,
    isLoading: false,
    isError: false,
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Checklist: Story = {};

export const Loading: Story = {
  args: { readiness: undefined, isLoading: true },
};

export const LoadFailed: Story = {
  args: { readiness: undefined, isError: true },
};
