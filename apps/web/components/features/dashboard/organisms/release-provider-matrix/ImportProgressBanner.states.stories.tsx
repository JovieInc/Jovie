import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, within } from 'storybook/test';
import { ImportProgressBanner } from './ImportProgressBanner';

const LONG_ARTIST_NAME =
  'Sasha Waves and the Extraordinarily Long Collaborative Orchestra of the Northern Coastline';

const withRtl: Decorator = Story => (
  <div dir='rtl'>
    <Story />
  </div>
);

const withNarrowColumn: Decorator = Story => (
  <div className='w-full max-w-sm'>
    <Story />
  </div>
);

const meta = {
  title:
    'Dashboard/Organisms/ReleaseProviderMatrix/ImportProgressBanner States',
  component: ImportProgressBanner,
  parameters: { layout: 'padded' },
  args: {
    artistName: 'Sasha Waves',
    importedCount: 4,
    totalCount: 12,
  },
} satisfies Meta<typeof ImportProgressBanner>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: nothing imported yet and no artist name or total known. */
export const EmptyNothingImported: Story = {
  args: { artistName: null, importedCount: 0, totalCount: 0 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByText('Importing releases from Spotify...')
    ).toBeVisible();
    await expect(canvas.getByText('0 imported')).toBeVisible();
  },
};

/** Partial: the total is unknown, so only the running count is shown. */
export const PartialUnknownTotal: Story = {
  args: { importedCount: 5, totalCount: 0 },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('5 imported')).toBeVisible();
  },
};

/** Long content: a long artist name truncates and the count stays whole. */
export const LongContentArtistName: Story = {
  args: {
    artistName: LONG_ARTIST_NAME,
    importedCount: 1280,
    totalCount: 4096,
    enrichmentStatus: 'enriching',
  },
  decorators: [withNarrowColumn],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('1280 of 4096 imported')).toBeVisible();
    await expect(
      canvas.getByTestId('release-enrichment-progress-banner')
    ).toBeVisible();
  },
};

/** Long content, compact: the same name inside the compact pill. */
export const LongContentCompactArtistName: Story = {
  args: { artistName: LONG_ARTIST_NAME, compact: true },
};

/** Right-to-left: import progress inside an RTL document. */
export const RtlImporting: Story = {
  args: { artistName: 'ساشا ويفز' },
  decorators: [withRtl],
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole('progressbar', {
        name: 'Importing releases: 4 of 12',
      })
    ).toBeVisible();
  },
};
