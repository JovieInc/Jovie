import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { BrowserFrame } from './BrowserFrame';

/**
 * Rendered states of the decorative browser chrome. The screenshot render
 * lives in BrowserFrame.stories.tsx.
 */
const meta = {
  title: 'Features/Demo/BrowserFrame/States',
  component: BrowserFrame,
  parameters: { layout: 'centered' },
  args: { children: null },
} satisfies Meta<typeof BrowserFrame>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: the chrome with nothing inside it yet. */
export const EmptyFrame: Story = {
  decorators: [
    function FrameWidth(StoryComponent) {
      return (
        <div className='w-96'>
          <StoryComponent />
        </div>
      );
    },
  ],
};

/** Long content: a tall, text-heavy page inside the frame. */
export const LongContentPage: Story = {
  args: {
    children: (
      <div className='w-96 space-y-2 bg-surface-0 p-4 text-sm text-secondary-token'>
        {Array.from({ length: 12 }, (_, index) => `line-${index + 1}`).map(
          (lineId, index) => (
            <p key={lineId}>
              Release plan line {index + 1}: pitch playlists, schedule the fan
              SMS and update every service link before the drop.
            </p>
          )
        )}
      </div>
    ),
  },
};

/** Right-to-left: Arabic page copy inside the frame. */
export const RtlArabicPage: Story = {
  args: {
    children: (
      <div
        dir='rtl'
        lang='ar'
        className='w-96 bg-surface-0 p-4 text-sm text-secondary-token'
      >
        خطة الإصدار: جدولة الرسائل وتحديث روابط كل خدمة قبل الإصدار.
      </div>
    ),
  },
};
