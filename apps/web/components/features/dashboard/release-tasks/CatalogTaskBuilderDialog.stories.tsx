import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import {
  type CatalogBrowserCluster,
  type CatalogBrowserRow,
  CatalogTaskBuilderDialog,
} from './CatalogTaskBuilderDialog';

const clusters: CatalogBrowserCluster[] = [
  { id: 1, slug: 'editorial-pitching', displayName: 'Editorial Pitching' },
  { id: 2, slug: 'dj-promotion', displayName: 'DJ Promotion' },
];

const catalog: CatalogBrowserRow[] = [
  {
    slug: 'spotify-editorial-pitch',
    name: 'Pitch Spotify editorial',
    shortDescription: 'Submit via Spotify for Artists.',
    clusterId: 1,
    category: 'editorial',
  },
  {
    slug: 'amazon-editorial-pitch',
    name: 'Pitch Amazon Music editorial',
    shortDescription: 'Submit via Amazon Music for Artists.',
    clusterId: 1,
    category: 'editorial',
  },
  {
    slug: 'dj-promo-pool-bpm-supreme',
    name: 'DJ promo pool submission',
    shortDescription: 'BPM Supreme / DJcity.',
    clusterId: 2,
    category: 'dj',
  },
];

const meta = {
  title: 'Dashboard/Releases/CatalogTaskBuilderDialog',
  component: CatalogTaskBuilderDialog,
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    open: true,
    releaseId: 'release-story',
    catalog,
    clusters,
    alreadyAddedSlugs: [],
    onClose: fn(),
    onAdded: fn(),
    addAction: fn(async () => undefined),
  },
} satisfies Meta<typeof CatalogTaskBuilderDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Populated: Story = {};

export const Filtered: Story = {
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const search = await page.findByRole('searchbox', {
      name: 'Search Tasks',
    });
    await userEvent.type(search, 'Amazon');
    await expect(search).toHaveValue('Amazon');
    await expect(
      page.getByText('Pitch Amazon Music editorial')
    ).toBeInTheDocument();
    await expect(
      page.queryByText('Pitch Spotify editorial')
    ).not.toBeInTheDocument();
  },
};

export const NoResults: Story = {
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const search = await page.findByRole('searchbox', {
      name: 'Search Tasks',
    });
    await userEvent.type(search, 'No matching task');
    await expect(
      page.getByText('No catalog tasks match that search.')
    ).toBeInTheDocument();
  },
};

export const AlreadyAdded: Story = {
  args: {
    alreadyAddedSlugs: ['spotify-editorial-pitch'],
  },
};
