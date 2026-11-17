import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ARTIST_PROFILE_COPY } from '@/data/artistProfileCopy';
import { MarketingPageShell } from '../MarketingPageShell';
import { CompactGlassCaptureDemo } from './CompactGlassCaptureDemo';

const CAPTURE = ARTIST_PROFILE_COPY.capture;

const meta = {
  title: 'Marketing/ArtistProfile/CompactGlassCaptureDemo States',
  component: CompactGlassCaptureDemo,
  parameters: {
    layout: 'fullscreen',
    backgrounds: { default: 'dark' },
  },
  decorators: [
    function WithMarketingShell(Story) {
      return (
        <MarketingPageShell className='min-h-screen bg-page'>
          <div className='mx-auto flex w-full max-w-96 flex-col px-6 py-16'>
            <Story />
          </div>
        </MarketingPageShell>
      );
    },
  ],
} satisfies Meta<typeof CompactGlassCaptureDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Partial: the demo held mid-sequence, with the example address submitting. */
export const PartialSubmitting: Story = {
  args: { initialPhase: 'submitting', label: 'Fan updates' },
};

/** Right-to-left: Arabic capture copy in an Arabic document. */
export const RtlArabic: Story = {
  args: {
    label: 'تحديثات المعجبين',
    capture: {
      ...CAPTURE,
      action: {
        ...CAPTURE.action,
        ctaLabel: 'اشترك',
        detail: 'احصل على تنبيهات الإصدار',
        confirmedLabel: 'تم الاشتراك',
      },
    },
  },
  decorators: [
    function WithArabicDocument(Story) {
      return (
        <div dir='rtl' lang='ar'>
          <Story />
        </div>
      );
    },
  ],
};
