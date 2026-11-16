import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReactNode } from 'react';
import { TrackMetaSummary } from './TrackMetaSummary';

function Frame(Story: () => ReactNode) {
  return (
    <div className='w-72'>
      <Story />
    </div>
  );
}

function RtlFrame(Story: () => ReactNode) {
  return (
    <div dir='rtl' className='w-72'>
      <Story />
    </div>
  );
}

/**
 * State coverage for the track meta summary. The canonical stories stay in
 * TrackMetaSummary.stories.tsx; these change which details are known, the
 * title length and the document direction.
 */
const meta = {
  title: 'Organisms/ReleaseSidebar/TrackMetaSummary States',
  component: TrackMetaSummary,
  parameters: {
    layout: 'centered',
  },
  decorators: [Frame],
  args: {
    title: 'Midnight Drive',
    trackNumber: 1,
    discNumber: 1,
    durationMs: 214000,
    isrc: 'USRC17607839',
  },
} satisfies Meta<typeof TrackMetaSummary>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Partial: no duration or ISRC yet, so the meta line is dropped. */
export const PartialNoDurationOrIsrc: Story = {
  args: { durationMs: null, isrc: null },
};

/** Long content: a long explicit title truncates on one line in the drawer variant. */
export const LongContentTitle: Story = {
  args: {
    title:
      'Midnight Drive (Extended Club Mix featuring The Northern Hemisphere Orchestra)',
    trackNumber: 14,
    discNumber: 2,
    isExplicit: true,
    variant: 'drawer',
  },
};

/** Right-to-left: the summary inside an RTL document. */
export const RtlDocument: Story = {
  args: { title: 'قيادة منتصف الليل' },
  decorators: [RtlFrame],
};
