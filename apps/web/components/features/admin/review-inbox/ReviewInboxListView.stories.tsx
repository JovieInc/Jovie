import '@/styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { createPilotReviewCase } from '@/lib/ovie/review-inbox/pilot-fixture';
import { ReviewInboxListView } from './ReviewInboxListView';

const meta = {
  title: 'Features/Admin/ReviewInbox/ReviewInboxListView',
  component: ReviewInboxListView,
} satisfies Meta<typeof ReviewInboxListView>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    pilotCase: createPilotReviewCase(),
    selectedRevision: 'v1',
    onSelect: () => undefined,
  },
};
