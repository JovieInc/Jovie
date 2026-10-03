import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { assembleVisibilityAudit } from '@/lib/visibility-audit/assemble';
import { TIM_WHITE_VISIBILITY_AUDIT_INPUT } from '@/lib/visibility-audit/fixtures/tim-white';
import { VisibilityAuditReportView } from './VisibilityAuditReportView';

const report = assembleVisibilityAudit(TIM_WHITE_VISIBILITY_AUDIT_INPUT);

const meta = {
  title: 'Features/Visibility Audit/VisibilityAuditReportView',
  component: VisibilityAuditReportView,
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [
    Story => (
      <div className='min-h-screen bg-surface-page'>
        <Story />
      </div>
    ),
  ],
  args: {
    report,
  },
} satisfies Meta<typeof VisibilityAuditReportView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const TimSample: Story = {};

export const WithoutEvidenceNote: Story = {
  args: {
    report: {
      ...report,
      evidenceNote: null,
    },
  },
};
