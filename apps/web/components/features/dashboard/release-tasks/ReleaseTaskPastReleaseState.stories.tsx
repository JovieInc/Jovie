import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { ReleaseTaskPastReleaseState } from './ReleaseTaskPastReleaseState';

const meta = {
  title: 'Dashboard/ReleaseTasks/ReleaseTaskPastReleaseState',
  component: ReleaseTaskPastReleaseState,
  parameters: { layout: 'padded' },
  decorators: [
    function NarrowColumn(Story) {
      return (
        <div className='max-w-md'>
          <Story />
        </div>
      );
    },
  ],
  args: {
    onSetUpAnyway: fn(),
    isLoading: false,
  },
} satisfies Meta<typeof ReleaseTaskPastReleaseState>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The release is already out and no plan exists yet. */
export const Default: Story = {};

/** Loading: the plan is being generated after the artist asked for one. */
export const LoadingGeneratingPlan: Story = {
  args: { isLoading: true },
};

/**
 * Offline: the generate request is in flight while the network is gone; the
 * button stays busy and disabled until the mutation settles.
 */
export const OfflinePendingGenerate: Story = {
  args: { isLoading: true },
};

/** Long content: the empty state inside a very narrow column. */
export const LongContentNarrowColumn: Story = {
  decorators: [
    function VeryNarrowColumn(Story) {
      return (
        <div className='w-48'>
          <Story />
        </div>
      );
    },
  ],
};

/** Right-to-left: the empty state in an Arabic document direction. */
export const RtlArabicDocument: Story = {
  decorators: [
    function RtlDocument(Story) {
      return (
        <div dir='rtl' lang='ar'>
          <Story />
        </div>
      );
    },
  ],
};
