import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ARTIST_PROFILE_COPY } from '@/data/artistProfileCopy';
import { createMarketingMediaRecipeInput } from '@/data/marketing/mediaRecipes';
import { ArtistProfileSectionHeader } from './artist-profile/ArtistProfileSectionHeader';
import { ArtistProfileSectionShell } from './artist-profile/ArtistProfileSectionShell';
import { MarketingMedia } from './MarketingMedia';

const meta = {
  title: 'Marketing/MediaRecipes',
  component: MarketingMedia,
  parameters: { layout: 'fullscreen' },
  args: { request: createMarketingMediaRecipeInput('dark-glass') },
  decorators: [
    Story => (
      <ArtistProfileSectionShell
        sectionId='feature-split'
        sectionVariant='editorial'
        className='min-h-screen bg-base text-primary-token'
        containerClassName='relative z-10'
      >
        <div className='px-4 md:px-6'>
          <ArtistProfileSectionHeader
            headline={ARTIST_PROFILE_COPY.adaptive.headline}
            body={ARTIST_PROFILE_COPY.adaptive.body}
          />
          <div className='relative mt-8'>
            <Story />
          </div>
        </div>
      </ArtistProfileSectionShell>
    ),
  ],
} satisfies Meta<typeof MarketingMedia>;
export default meta;
type Story = StoryObj<typeof meta>;
export const LargeGlass: Story = {};
export const CompactGlass: Story = {
  args: { request: createMarketingMediaRecipeInput('compact-glass') },
};
export const Flow: Story = {
  args: { request: createMarketingMediaRecipeInput('flowing-accent') },
  decorators: [
    Story => (
      <div className='relative min-h-96'>
        <Story />
      </div>
    ),
  ],
};
export const Soft: Story = {
  args: {
    request: createMarketingMediaRecipeInput('soft-editorial-background'),
  },
  decorators: [
    Story => (
      <div className='relative min-h-96'>
        <Story />
      </div>
    ),
  ],
};
