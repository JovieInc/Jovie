import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { buildGate, LONG_RUN_SUMMARY } from './agentOsArtifact.test-fixtures';
import { VerificationGateList } from './VerificationGateList';

/** State coverage for the verification gate list. */
const meta = {
  title: 'Features/Admin/VerificationGateList States',
  component: VerificationGateList,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof VerificationGateList>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Long content: many gates with long summaries wrap under each name. */
export const LongContentManyGates: Story = {
  args: {
    gates: [
      buildGate({ name: 'github.ci', summary: LONG_RUN_SUMMARY }),
      buildGate({
        name: 'github.branch-protection',
        status: 'blocked',
        summary: LONG_RUN_SUMMARY,
      }),
      buildGate({
        name: 'gstack.land-and-deploy',
        required: false,
        status: 'queued',
        summary: LONG_RUN_SUMMARY,
      }),
      buildGate({ name: 'gstack.qa.exhaustive', status: 'running' }),
      buildGate({ name: 'sentry.canary', status: 'failed', summary: null }),
    ],
  },
};

/** Right-to-left: the gate list inside an RTL document. */
export const RtlDocument: Story = {
  args: {
    gates: [
      buildGate({ summary: 'نجحت جميع الفحوصات على آخر إصدار.' }),
      buildGate({
        name: 'gstack.review',
        required: false,
        status: 'missing',
        summary: null,
      }),
    ],
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
