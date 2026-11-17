import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import {
  CONNECTED_COMPONENTS_COPY,
  type ConnectedComponentsCopy,
} from '@/data/connectedComponentsCopy';
import { ConnectedComponentsGallery } from './ConnectedComponentsGallery';

// The copy type is the literal registry record; story-only variants are cast.
const asCopy = (copy: unknown) => copy as ConnectedComponentsCopy;
const [comingSoon, outNow, profile] = CONNECTED_COMPONENTS_COPY.states;

const meta = {
  title: 'Marketing/ConnectedComponentsGallery States',
  component: ConnectedComponentsGallery,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof ConnectedComponentsGallery>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Partial: one caption-only state beside two real captures. */
export const PartialCaptionOnlyState: Story = {
  args: {
    copy: asCopy({
      ...CONNECTED_COMPONENTS_COPY,
      states: [
        comingSoon,
        outNow,
        { id: 'profile', title: profile.title, body: profile.body },
      ],
    }),
  },
};

/** Long content: a long headline, intro and captions. */
export const LongContentCaptions: Story = {
  args: {
    copy: asCopy({
      ...CONNECTED_COMPONENTS_COPY,
      headline:
        'Announce it, release it, and keep it on your profile long after release day has passed.',
      intro:
        'Your profile and release pages stay connected before and after release day, so every visitor lands on the newest thing you made and can still find everything that came before it.',
      states: [
        {
          ...comingSoon,
          body: 'Before release day, your profile says what is coming, when it lands and lets people ask for an update the moment it is out on every service.',
        },
        outNow,
        profile,
      ],
    }),
  },
};

/** Right-to-left: Arabic headline and captions in an Arabic document. */
export const RtlArabic: Story = {
  args: {
    copy: asCopy({
      ...CONNECTED_COMPONENTS_COPY,
      headline: 'أعلن عنه. أصدره. أبقه في صفحتك.',
      intro: 'تبقى صفحتك وصفحات إصدارك متصلة قبل يوم الإصدار وبعده.',
      galleryLabel: 'صفحات الإصدار',
      states: [
        { ...comingSoon, title: 'إصدار قادم', body: 'تقول صفحتك ما هو قادم.' },
        { ...outNow, title: 'متاح الآن', body: 'رابط واحد لكل مستمع.' },
        { ...profile, title: 'صفحتك', body: 'أحدث إصدار أولًا.' },
      ],
    }),
  },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
};
