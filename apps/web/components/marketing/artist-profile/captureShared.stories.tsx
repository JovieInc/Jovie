import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ARTIST_NOTIFICATIONS_COPY } from '@/data/artistNotificationsCopy';
import { AudiencePill, AudienceRail, CaptureActionPill } from './captureShared';

const meta = {
  title: 'Marketing/Artist Profile/captureShared',
  component: CaptureActionPill,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof CaptureActionPill>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ActionPillIdle: Story = {
  args: {
    capture: ARTIST_NOTIFICATIONS_COPY.capture,
    phase: 'idle',
  },
};

export const ActionPillDone: Story = {
  args: {
    capture: ARTIST_NOTIFICATIONS_COPY.capture,
    phase: 'done',
  },
};

export const Pill: StoryObj<typeof AudiencePill> = {
  render: () => (
    <AudiencePill
      accentIndex={0}
      pill={ARTIST_NOTIFICATIONS_COPY.capture.audienceRails[0][0]}
    />
  ),
};

export const Rail: StoryObj<typeof AudienceRail> = {
  render: () => (
    <AudienceRail
      direction='left'
      railIndex={0}
      pills={ARTIST_NOTIFICATIONS_COPY.capture.audienceRails[0]}
    />
  ),
};
