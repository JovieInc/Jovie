import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, within } from 'storybook/test';
import {
  FeaturedArtistsSection,
  type FeaturedCreator,
} from './FeaturedArtistsSection';

/**
 * State coverage for the featured creators row. These render the same
 * section as FeaturedArtistsSection.stories.tsx and change only the creators
 * the caller passes, the name display or the document direction. Every
 * avatar uses the checked-in app icon, so no image URL is invented.
 */
const meta = {
  title: 'Organisms/FeaturedArtistsSection States',
  component: FeaturedArtistsSection,
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    creators: [],
  },
} satisfies Meta<typeof FeaturedArtistsSection>;

export default meta;
type Story = StoryObj<typeof meta>;

function creators(count: number, name: (index: number) => string) {
  return Array.from(
    { length: count },
    (_, index): FeaturedCreator => ({
      id: `states-${index + 1}`,
      handle: `states-artist-${index + 1}`,
      name: name(index),
      src: '/apple-touch-icon.png',
    })
  );
}

/** Empty: no featured creators yet; the labelled section and title remain. */
export const EmptyCreators: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole('region', { name: 'Featured Creators' })
    ).toBeInTheDocument();
    await expect(canvas.queryAllByRole('listitem')).toHaveLength(0);
  },
};

/** Partial: creators with no alt text and names hidden behind the avatars. */
export const PartialNamesHidden: Story = {
  args: {
    creators: creators(3, index => `Artist ${index + 1}`),
    showNames: false,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole('region', { name: 'Featured Creators' })
    ).toBeInTheDocument();
  },
};

/** Long content: twenty creators with long names scroll horizontally. */
export const LongContentManyCreators: Story = {
  args: {
    creators: creators(
      20,
      index => `Artist ${index + 1} and the Very Long Band Name Collective`
    ),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole('region', { name: 'Featured Creators' })
    ).toBeInTheDocument();
  },
};

/** Right-to-left: Arabic creator names inside an RTL document. */
export const RtlArabicCreators: Story = {
  args: {
    title: 'فنانون مميزون',
    creators: creators(4, index => `فنان ${index + 1}`),
  },
  decorators: [
    Story => (
      <div dir='rtl'>
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole('heading', { name: 'فنانون مميزون' })
    ).toBeInTheDocument();
  },
};
