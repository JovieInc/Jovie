import '@/styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import {
  createPilotReviewCase,
  PILOT_V1_DIGEST,
} from '@/lib/ovie/review-inbox/pilot-fixture';
import { ReviewCanvas } from './ReviewCanvas';

const asset = createPilotReviewCase().candidates[0]!;

const marks = {
  pins: [],
  strokes: [
    {
      id: 'stroke-1',
      assetDigest: PILOT_V1_DIGEST,
      revision: 'v1',
      points: [
        [0.2, 0.6],
        [0.3, 0.7],
        [0.45, 0.68],
        [0.55, 0.58],
      ] as const,
      author: 'founder' as const,
    },
  ],
};

const meta = {
  title: 'Features/Admin/ReviewInbox/ReviewCanvas',
  component: ReviewCanvas,
  args: { asset, marks, onSave: () => undefined },
} satisfies Meta<typeof ReviewCanvas>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Editable: Story = {};

export const Compact: Story = { args: { compact: true } };

export const Stale: Story = { args: { stale: true, newerRevision: 'v2' } };
