import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ReleaseTaskExplainerPopover } from './ReleaseTaskExplainerPopover';

const meta = {
  title: 'Dashboard/ReleaseTasks/ReleaseTaskExplainerPopover',
  component: ReleaseTaskExplainerPopover,
  parameters: { layout: 'centered' },
  args: {
    explainerText: 'Pitch the release to editorial playlists before launch.',
    learnMoreUrl: 'https://example.com/guides/playlist-pitching',
  },
} satisfies Meta<typeof ReleaseTaskExplainerPopover>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** Long content: explainer copy that wraps over many lines in the popover. */
export const LongContentExplainer: Story = {
  args: {
    explainerText:
      'Pitch the release to editorial playlists at least four weeks before launch, include the release date, a short artist bio, the story behind the record and links to previous placements so curators can judge fit quickly.',
  },
};

/** Rtl: an Arabic explainer inside a right-to-left container. */
export const RtlExplainer: Story = {
  args: { explainerText: 'قدّم الإصدار إلى قوائم التشغيل قبل موعد الإطلاق.' },
  decorators: [
    function RtlFrame(Story) {
      return (
        <div dir='rtl'>
          <Story />
        </div>
      );
    },
  ],
};
