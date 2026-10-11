import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { VideoRecordingProposalPayload } from '@/lib/teleprompter/types';
import { ChatVideoRecordingProposalCard } from './ChatVideoRecordingProposalCard';

const payload: VideoRecordingProposalPayload = {
  success: true,
  kind: 'promo',
  title: 'Record a 30-second promo',
  script:
    'Hold the camera at eye level, press record, and walk through the release.',
  showcaseVariant: 'direct',
};

const meta = {
  title: 'Jovie/Components/ChatVideoRecordingProposalCard',
  component: ChatVideoRecordingProposalCard,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof ChatVideoRecordingProposalCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    profileId: 'story-profile',
    payload,
  },
};
