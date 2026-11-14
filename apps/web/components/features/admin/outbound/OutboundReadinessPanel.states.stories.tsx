import '@/styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReactNode } from 'react';
import { expect, within } from 'storybook/test';
import type { OutboundReadiness } from '@/lib/outbound/readiness';
import { OutboundReadinessPanel } from './OutboundReadinessPanel';

function SurfaceDecorator(Story: () => ReactNode) {
  return (
    <div className='bg-base text-primary-token'>
      <Story />
    </div>
  );
}

function RtlSurfaceDecorator(Story: () => ReactNode) {
  return (
    <div className='bg-base text-primary-token' dir='rtl'>
      <Story />
    </div>
  );
}

const LONG_DETAIL =
  'Seven of eight receipts are green, but the payment entitlement receipt has been red since the last deploy and blocks every acquisition send until the Golden Path lane passes again.';

const longReadiness: OutboundReadiness = {
  generatedAt: '2026-10-04T12:00:00Z',
  ready: 0,
  total: 1,
  items: [
    {
      id: 'cone',
      label:
        'Revenue cone: acquisition eligible across every paid surface and every checkout entry point',
      status: 'red',
      detail: LONG_DETAIL,
      owner: 'revenue-operations',
      href: null,
      children: [
        {
          id: 'cone:payment_entitlement',
          label: 'Golden Path payment entitlement receipt for the annual plan',
          status: 'unknown',
          detail: LONG_DETAIL,
          owner: 'billing',
          href: 'https://linear.app/jovie/issue/JOV-7192',
        },
      ],
    },
  ],
};

const rtlReadiness: OutboundReadiness = {
  generatedAt: '2026-10-04T12:00:00Z',
  ready: 1,
  total: 2,
  items: [
    {
      id: 'certifications',
      label: 'تم اعتماد الشهادات',
      status: 'green',
      detail: 'لا يوجد أشخاص بانتظار مراجعة الحقائق',
      owner: 'outbound',
      href: null,
    },
    {
      id: 'production',
      label: 'الإنتاج محدث',
      status: 'info',
      detail: 'معلومات البناء غير متوفرة',
      owner: 'release',
      href: null,
    },
  ],
};

/** State coverage for the readiness checklist. */
const meta: Meta<typeof OutboundReadinessPanel> = {
  title: 'Admin/Outbound/Readiness States',
  component: OutboundReadinessPanel,
  parameters: { layout: 'fullscreen' },
  decorators: [SurfaceDecorator],
  args: { readiness: longReadiness, isLoading: false, isError: false },
};

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: readiness loaded with no items, so the list has no rows. */
export const EmptyChecklist: Story = {
  args: {
    readiness: {
      generatedAt: '2026-10-04T12:00:00Z',
      ready: 0,
      total: 0,
      items: [],
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole('list', { name: 'Readiness' })
    ).toBeEmptyDOMElement();
  },
};

/** Error: readiness could not load and the panel says how to recover. */
export const ErrorCouldNotLoad: Story = {
  args: { readiness: undefined, isError: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByText('Readiness could not load. Refresh to try again.')
    ).toBeVisible();
  },
};

/** Long content: long labels and details wrap; the owner stays on the edge. */
export const LongContentItems: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getAllByText(LONG_DETAIL)).toHaveLength(2);
    await expect(canvas.getByText('revenue-operations')).toBeVisible();
  },
};

/** Right-to-left: status icon, copy and owner mirror in an RTL document. */
export const RtlChecklist: Story = {
  args: { readiness: rtlReadiness },
  decorators: [RtlSurfaceDecorator],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('تم اعتماد الشهادات')).toBeVisible();
    await expect(canvas.getByLabelText('Ready')).toBeVisible();
  },
};
