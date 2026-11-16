import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { MarketingPhoneStateGallery } from './MarketingPhoneStateGallery';

/** Rendered states of the phone gallery; defaults live in MarketingPhoneStateGallery.stories.tsx. */
const meta = {
  title: 'Marketing/MarketingPhoneStateGallery States',
  component: MarketingPhoneStateGallery,
  parameters: { layout: 'padded' },
  args: { label: 'Profile states', states: [] },
} satisfies Meta<typeof MarketingPhoneStateGallery>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: the gallery region with no states to show. */
export const EmptyGallery: Story = {};

/** Partial: one registry capture beside a caption-only state with no phone. */
export const PartialCaptionOnly: Story = {
  args: {
    states: [
      {
        id: 'listen',
        scenarioId: 'tim-white-profile-listen-mobile',
        alt: 'Profile showing the music catalog.',
        title: 'Listen',
        body: 'Fans land on the right release.',
      },
      {
        id: 'caption-only',
        title: 'Stay Close',
        body: 'A signup becomes a relationship.',
      },
    ],
  },
};

/** Long content: four states with long titles and captions. */
export const LongContentCaptions: Story = {
  args: {
    states: [
      'tim-white-profile-listen-mobile',
      'tim-white-profile-tour-mobile',
      'tim-white-profile-subscribe-mobile',
      'tim-white-profile-live-mobile',
    ].map((scenarioId, index) => ({
      id: scenarioId,
      scenarioId,
      alt: `Profile state ${index + 1} of the same artist profile.`,
      title: `A deliberately long state title number ${index + 1} that wraps`,
      body: 'A caption long enough to wrap across several lines on a phone, so the rail keeps every figure the same height without clipping the copy.',
    })),
  },
};

/** Right-to-left: Arabic captions in an Arabic document direction. */
export const RtlArabic: Story = {
  args: {
    label: 'حالات الملف',
    states: [
      {
        id: 'listen',
        scenarioId: 'tim-white-profile-listen-mobile',
        alt: 'الملف يعرض كتالوج الموسيقى.',
        title: 'استمع',
        body: 'يصل المعجبون إلى الإصدار الصحيح.',
      },
      { id: 'stay', title: 'ابق قريبًا', body: 'يتحول التسجيل إلى علاقة.' },
    ],
  },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
};
