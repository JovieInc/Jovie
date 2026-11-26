import '@/styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { createPilotReviewCase } from '@/lib/ovie/review-inbox/pilot-fixture';
import { ReviewInboxComparisonArtboard } from './ReviewInboxComparisonArtboard';

const pilotCase = createPilotReviewCase();

const meta = {
  title: 'Features/Admin/ReviewInbox/ReviewInboxComparisonArtboard',
  component: ReviewInboxComparisonArtboard,
} satisfies Meta<typeof ReviewInboxComparisonArtboard>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Open: Story = {
  args: {
    candidates: pilotCase.candidates,
    activeRevision: 'v1',
    pins: [],
    open: true,
    onClose: () => undefined,
    onAddPin: () => undefined,
    draftNote: 'Tighten crop',
    onDraftNoteChange: () => undefined,
  },
};
