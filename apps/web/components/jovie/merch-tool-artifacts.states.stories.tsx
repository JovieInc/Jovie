// screen-cert-repair: generated
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import {
  ChatMerchSourceSelectionCard,
  ChatMerchZeroDesignCard,
} from './merch-tool-artifacts';

const meta = {
  title: 'Features/Chat/MerchSourceSelectionCard/States',
  component: ChatMerchSourceSelectionCard,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof ChatMerchSourceSelectionCard>;

export default meta;

export const PartialOptionalMessage: StoryObj<typeof meta> = {
  args: {
    message:
      'Choose a confirmed catalog phrase before Jovie generates any artwork.',
    candidates: [
      {
        sourceType: 'song_title',
        sourceText: 'Neon Skyline',
        provenanceTitle: 'Neon Skyline',
      },
      {
        sourceType: 'album_title',
        sourceText: 'Midnight Drive',
        provenanceTitle: 'Midnight Drive',
      },
    ],
  },
  render: () => <ChatMerchZeroDesignCard />,
};

export const LongContent: StoryObj<typeof meta> = {
  args: {
    message:
      'Choose a confirmed catalog phrase before Jovie generates any artwork. and the rest of the confirmed catalog phrase',
    candidates: [
      {
        sourceType: 'song_title',
        sourceText: 'Neon Skyline and the rest of the confirmed catalog phrase',
        provenanceTitle:
          'Neon Skyline and the rest of the confirmed catalog phrase',
      },
      {
        sourceType: 'album_title',
        sourceText:
          'Midnight Drive and the rest of the confirmed catalog phrase',
        provenanceTitle:
          'Midnight Drive and the rest of the confirmed catalog phrase',
      },
    ],
  },
};

export const RtlArabicPhrase: StoryObj<typeof meta> = {
  args: {
    message: 'اختر عبارة مؤكدة من الكتالوج قبل أن تنشئ أي عمل فني.',
    candidates: [
      {
        sourceType: 'song_title',
        sourceText: 'أفق النيون',
        provenanceTitle: 'أفق النيون',
      },
      {
        sourceType: 'album_title',
        sourceText: 'أفق النيون',
        provenanceTitle: 'أفق النيون',
      },
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
