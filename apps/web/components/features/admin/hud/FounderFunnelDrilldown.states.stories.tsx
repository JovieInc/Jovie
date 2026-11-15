import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { FounderFunnelStageRows } from '@/lib/admin/types';
import { FounderFunnelDrilldown } from './FounderFunnelDrilldown';

/** State coverage for the founder funnel stage drill-down. */
const result: FounderFunnelStageRows = {
  stage: 'accounts_created',
  stageLabel: 'Accounts created',
  stageDescription: 'Created an account',
  timeRange: '30d',
  total: 2,
  rows: [
    {
      id: 'u1',
      displayName: 'Ada Lovelace',
      email: 'ada@example.com',
      enteredAt: '2026-09-28T12:00:00.000Z',
    },
    {
      id: 'u2',
      displayName: null,
      email: 'anon@example.com',
      enteredAt: '2026-09-22T18:45:00.000Z',
    },
  ],
  limit: 100,
  errors: [],
  definitionVersion: 'founder-funnel.v2',
};

const meta = {
  title: 'Features/Admin/Hud/FounderFunnelDrilldown States',
  component: FounderFunnelDrilldown,
  args: { result },
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof FounderFunnelDrilldown>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Error: the stage query failed, so its message replaces the table. */
export const ErrorStageQuery: Story = {
  args: {
    result: {
      ...result,
      errors: ['stage query failed', 'identity lookup timed out'],
    },
  },
};

/** Long content: long names and emails, and a truncated first page. */
export const LongContentRecords: Story = {
  args: {
    result: {
      ...result,
      stageLabel: 'Accounts created and verified through the onboarding flow',
      stageDescription:
        'Created an account, verified an email address and finished every onboarding step',
      total: 12_480,
      rows: Array.from({ length: 12 }, (_, index) => ({
        id: `long-${index}`,
        displayName: `Maximilian Alexander Featherstonehaugh-Worthington ${index + 1}`,
        email: `maximilian.alexander.featherstonehaugh-worthington.${index + 1}@example.com`,
        enteredAt: '2026-09-28T12:00:00.000Z',
      })),
    },
  },
};

/** Right-to-left: the drill-down inside an RTL document. */
export const RtlDocument: Story = {
  args: {
    result: {
      ...result,
      stageLabel: 'الحسابات المنشأة',
      stageDescription: 'أنشأ حسابًا',
      rows: [
        {
          id: 'rtl-1',
          displayName: 'ليلى أحمد',
          email: 'layla@example.com',
          enteredAt: '2026-09-28T12:00:00.000Z',
        },
      ],
      total: 1,
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
