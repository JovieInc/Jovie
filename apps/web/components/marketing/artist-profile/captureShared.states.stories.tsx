import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ARTIST_NOTIFICATIONS_COPY } from '@/data/artistNotificationsCopy';
import { AudienceRail, CaptureActionPill } from './captureShared';

const CAPTURE = ARTIST_NOTIFICATIONS_COPY.capture;

const meta = {
  title: 'Marketing/Artist Profile/captureShared States',
  component: CaptureActionPill,
  parameters: { layout: 'centered' },
  args: { capture: CAPTURE, phase: 'idle' },
} satisfies Meta<typeof CaptureActionPill>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: an audience rail with no pills renders an empty, hidden track. */
export const EmptyRail: StoryObj<typeof AudienceRail> = {
  render: () => <AudienceRail direction='right' railIndex={1} pills={[]} />,
};

/** Long content: long field and action labels inside the pill. */
export const LongContentPill: Story = {
  args: {
    phase: 'idle',
    capture: {
      ...CAPTURE,
      action: {
        ...CAPTURE.action,
        detail: `${CAPTURE.action.detail} ${CAPTURE.action.detail}`,
        ctaLabel: `${CAPTURE.action.ctaLabel} for every release`,
      },
    },
  },
};

/** Long content: the typed example address while submitting. */
export const LongContentSubmitting: Story = {
  args: { phase: 'submitting' },
};

/** Right-to-left: Arabic pill copy in an Arabic document. */
export const RtlArabicPill: Story = {
  args: {
    capture: {
      ...CAPTURE,
      action: {
        ...CAPTURE.action,
        ctaLabel: 'اشترك',
        detail: 'احصل على تنبيهات الإصدار',
      },
    },
  },
  decorators: [
    function WithArabicDocument(Story) {
      return (
        <div dir='rtl' lang='ar'>
          <Story />
        </div>
      );
    },
  ],
};
