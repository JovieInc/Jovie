import '@/styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { createPilotReviewCase } from '@/lib/ovie/review-inbox/pilot-fixture';
import { ReviewInboxEditorialView } from './ReviewInboxEditorialView';

const meta = {
  title: 'Features/Admin/ReviewInbox/ReviewInboxEditorialView',
  component: ReviewInboxEditorialView,
} satisfies Meta<typeof ReviewInboxEditorialView>;

export default meta;

type Story = StoryObj<typeof meta>;

export const AwaitingReview: Story = {
  args: {
    pilotCase: createPilotReviewCase(),
    busy: false,
    onRequestChanges: () => undefined,
    onAcceptV2: () => undefined,
  },
};
