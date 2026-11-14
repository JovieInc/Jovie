import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ChatMerchSourceSelectionCard } from './merch-tool-artifacts';

const meta = {
  title: 'Features/Chat/MerchSourceSelectionCard',
  component: ChatMerchSourceSelectionCard,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof ChatMerchSourceSelectionCard>;

export default meta;

export const WithCatalogCandidates: StoryObj<typeof meta> = {
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
};

export const EmptyCandidates: StoryObj<typeof meta> = {
  args: {
    message:
      'Jovie could not find a confirmed catalog title. Add a title or provide a phrase you own before generating artwork.',
    candidates: [],
  },
};
