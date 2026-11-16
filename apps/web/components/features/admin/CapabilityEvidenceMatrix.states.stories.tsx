import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, within } from 'storybook/test';
import { CAPABILITY_EVIDENCE_FIXTURE } from '@/lib/admin/capability-evidence-fixtures';
import { CapabilityEvidenceMatrix } from './CapabilityEvidenceMatrix';

const record = CAPABILITY_EVIDENCE_FIXTURE;

/** State coverage for the capability evidence matrix; its stages live in CapabilityEvidenceMatrix.stories.tsx. */
const meta = {
  title: 'Admin/CapabilityEvidenceMatrix States',
  component: CapabilityEvidenceMatrix,
  parameters: { layout: 'padded' },
  args: { record },
} satisfies Meta<typeof CapabilityEvidenceMatrix>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: exposure was measured and nobody used the capability in the window. */
export const EmptyZeroObservations: Story = {
  args: {
    record: {
      ...record,
      exposure: { ...record.exposure, count: 0, latestAt: null },
      outcome: {
        ...record.outcome,
        measured: false,
        count: null,
        latestAt: null,
      },
    },
  },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText(/0 in \d+d/)
    ).toBeInTheDocument();
  },
};

/** Error: both analytics reads failed, so neither shows a number. */
export const ErrorAnalyticsReadFailed: Story = {
  args: {
    record: {
      ...record,
      exposure: {
        ...record.exposure,
        measured: false,
        count: null,
        error: 'Read unavailable',
      },
      outcome: {
        ...record.outcome,
        measured: false,
        count: null,
        error: 'Read unavailable',
      },
    },
  },
  play: async ({ canvasElement }) => {
    await expect(
      canvasElement.querySelectorAll(
        '[data-measured="unknown"][title*="source error"]'
      )
    ).toHaveLength(2);
  },
};

const LONG_TITLE =
  'Public profile pages with release countdowns, merch drops, tour dates and every streaming destination in one place';

/** Long content: a long title clamps and a long golden path wraps. */
export const LongContentTitleAndPath: Story = {
  args: {
    record: {
      ...record,
      title: LONG_TITLE,
      goldenPath:
        'Fan opens a public artist profile from an Instagram story, scrolls past the release countdown, taps the pre-save link and returns later from the confirmation email to stream on release day.',
    },
  },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole('heading', { name: LONG_TITLE })
    ).toBeVisible();
  },
};

/** Right-to-left: the matrix inside an Arabic RTL document. */
export const RtlArabic: Story = {
  args: { record: { ...record, title: 'صفحات الملف الشخصي العامة' } },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole('heading', {
        name: 'صفحات الملف الشخصي العامة',
      })
    ).toBeVisible();
  },
};
