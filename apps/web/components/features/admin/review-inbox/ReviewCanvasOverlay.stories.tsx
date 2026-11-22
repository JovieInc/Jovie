import '@/styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ReviewCanvasOverlay } from './ReviewCanvasOverlay';

const meta = {
  title: 'Features/Admin/ReviewInbox/ReviewCanvasOverlay',
  component: ReviewCanvasOverlay,
  decorators: [
    Story => (
      <div className='relative aspect-video w-96 rounded-lg border border-subtle bg-surface-1'>
        <Story />
      </div>
    ),
  ],
  args: {
    savedStrokes: [
      {
        id: 's1',
        points: [
          [0.2, 0.6],
          [0.35, 0.72],
          [0.55, 0.58],
        ],
      },
    ],
    draftStrokes: [],
    activeStroke: null,
    pins: [],
    stale: false,
  },
} satisfies Meta<typeof ReviewCanvasOverlay>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Current: Story = {};

export const Stale: Story = { args: { stale: true } };
