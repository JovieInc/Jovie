import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, userEvent, within } from 'storybook/test';
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

/**
 * Upload Video sends the file through the account-video upload route. This
 * story refuses every request, so the card shows its failed-upload line
 * without leaving the browser.
 */
export const ErrorUploadFailed: Story = {
  args: {
    profileId: 'story-profile',
    payload,
  },
  beforeEach: () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      throw new Error('Upload failed. Try again.');
    };
    return () => {
      globalThis.fetch = originalFetch;
    };
  },
  play: async ({ canvasElement }) => {
    const fileInput =
      canvasElement.querySelector<HTMLInputElement>('input[type="file"]');
    if (!fileInput) throw new Error('Upload input is missing.');
    await userEvent.upload(
      fileInput,
      new File(['video'], 'promo.mp4', { type: 'video/mp4' })
    );
    await expect(await within(canvasElement).findByRole('alert')).toBeVisible();
  },
};

export const LongContent: Story = {
  args: {
    profileId: 'story-profile',
    payload: {
      ...payload,
      title:
        'Record a 30-second promo for the deluxe anniversary edition of the album before the pre-save window closes',
      script:
        'Hold the camera at eye level, press record, and walk through the release. Say where you wrote it, who played on it, what the cover means, when the vinyl ships, which cities the tour reaches first, and where fans can pre-save tonight. Finish by thanking the people who have been here since the first single.',
    },
  },
  decorators: [
    Story => (
      <div className='w-80'>
        <Story />
      </div>
    ),
  ],
};

export const Rtl: Story = {
  args: {
    profileId: 'story-profile',
    payload: {
      ...payload,
      title: 'سجّل مقطعاً ترويجياً مدته ٣٠ ثانية',
      script: 'أمسك الكاميرا على مستوى العين، اضغط تسجيل، ثم تحدّث عن الإصدار.',
    },
  },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar' className='w-80'>
        <Story />
      </div>
    ),
  ],
};
