import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReactNode } from 'react';
import { VisibilityAuditReportView } from './VisibilityAuditReportView';
import {
  EMPTY_VISIBILITY_AUDIT_REPORT,
  LONG_VISIBILITY_AUDIT_REPORT,
  SAMPLE_VISIBILITY_AUDIT_REPORT,
} from './visibility-audit-state-fixtures';

function withPage(Story: () => ReactNode) {
  return (
    <div className='min-h-screen bg-surface-page p-6'>
      <Story />
    </div>
  );
}

function withRtlPage(Story: () => ReactNode) {
  return (
    <div dir='rtl' lang='ar'>
      <Story />
    </div>
  );
}

const meta = {
  title: 'Features/Visibility Audit/VisibilityAuditReportView States',
  component: VisibilityAuditReportView,
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [withPage],
  args: {
    report: SAMPLE_VISIBILITY_AUDIT_REPORT,
  },
} satisfies Meta<typeof VisibilityAuditReportView>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: no identity steps, platforms, conflicts, checks, pixels or fixes. */
export const EmptyEvidence: Story = {
  args: { report: EMPTY_VISIBILITY_AUDIT_REPORT },
};

/** Long content: a long artist name, conflict summary and fix reason wrap. */
export const LongContentFixes: Story = {
  args: { report: LONG_VISIBILITY_AUDIT_REPORT },
};

/** RTL: the stored sample in a right-to-left document. */
export const RtlDocument: Story = {
  decorators: [withRtlPage],
};
