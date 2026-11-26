import '@/styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { OutboundReadinessPanel } from './OutboundReadinessPanel';

const meta = {
  title: 'Admin/Outbound/Readiness/States',
  component: OutboundReadinessPanel,
  parameters: { layout: 'fullscreen' },
  args: { readiness: undefined, isLoading: false, isError: false },
  decorators: [
    function ReadinessFrame(Story) {
      return (
        <div className='w-full max-w-md bg-base text-primary-token'>
          <Story />
        </div>
      );
    },
  ],
} satisfies Meta<typeof OutboundReadinessPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: a readiness report with no checklist items. */
export const EmptyChecklist: Story = {
  args: {
    readiness: {
      generatedAt: '2026-10-04T12:00:00Z',
      ready: 0,
      total: 0,
      items: [],
    },
  },
};

/** Error: the readiness request failed. */
export const ErrorLoadFailed: Story = {
  args: { isError: true },
};

/** Long content: a long label, detail and owner wrap inside the row. */
export const LongContentItem: Story = {
  args: {
    readiness: {
      generatedAt: '2026-10-04T12:00:00Z',
      ready: 0,
      total: 1,
      items: [
        {
          id: 'long',
          label:
            'Revenue cone: acquisition eligible once every payment receipt is green across all lanes',
          status: 'red',
          detail:
            'Seven of eight receipts are not green yet, including the Golden Path lane and the payment entitlement lane, which both need a fix before outbound can resume.',
          owner: 'revenue-and-billing-operations',
          href: null,
        },
      ],
    },
  },
};

/** Rtl: the checklist in a right-to-left container. */
export const RtlChecklist: Story = {
  args: {
    readiness: {
      generatedAt: '2026-10-04T12:00:00Z',
      ready: 1,
      total: 1,
      items: [
        {
          id: 'rtl',
          label: 'تم إلغاء الشهادات',
          status: 'green',
          detail: 'لا أحد ينتظر مراجعة الحقائق',
          owner: 'outbound',
          href: null,
        },
      ],
    },
  },
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
