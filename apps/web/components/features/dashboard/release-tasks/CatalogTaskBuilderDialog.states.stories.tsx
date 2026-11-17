import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn, userEvent, within } from 'storybook/test';
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
    slug: 'dj-promo-pool',
    name: 'DJ promo pool submission',
    shortDescription: 'Send the release to the promo pools.',
    clusterId: 2,
    category: 'dj',
  },
];

const meta = {
  title: 'Dashboard/Releases/CatalogTaskBuilderDialog/States',
  component: CatalogTaskBuilderDialog,
  parameters: { layout: 'fullscreen' },
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

async function clickFirstAdd(canvasElement: HTMLElement) {
  const page = within(canvasElement.ownerDocument.body);
  await userEvent.click(
    await page.findByTestId('catalog-add-spotify-editorial-pitch')
  );
}

/** Loading: an add is in flight, so its row reads Adding and is disabled. */
export const LoadingAddInFlight: Story = {
  args: { addAction: fn(() => new Promise<never>(() => {})) },
  play: async ({ canvasElement }) => clickFirstAdd(canvasElement),
};

/** Empty: the catalog has no tasks to offer. */
export const EmptyCatalog: Story = {
  args: { catalog: [], clusters: [] },
};

/** Error: the add request fails; the row stays addable and a toast reports it. */
export const ErrorAddFailed: Story = {
  args: {
    addAction: fn(async () => {
      throw new Error('Could not add');
    }),
  },
  play: async ({ canvasElement }) => clickFirstAdd(canvasElement),
};

/** Partial: rows without a description or cluster land under Uncategorized. */
export const PartialUncategorisedRows: Story = {
  args: {
    catalog: [
      ...catalog,
      {
        slug: 'backup-masters',
        name: 'Back up the masters',
        shortDescription: null,
        clusterId: null,
        category: 'ops',
      },
    ],
  },
};

/** Long content: long names and descriptions truncate inside each row. */
export const LongContentRows: Story = {
  args: {
    catalog: Array.from({ length: 14 }, (_, i) => ({
      slug: `long-task-${i}`,
      name: `Pitch every editorial playlist, blog, radio show and DJ pool contact in round ${i + 1}`,
      shortDescription:
        'Write a tailored pitch for each contact, attach the private stream link and follow up a week before release day.',
      clusterId: (i % 2) + 1,
      category: 'editorial',
    })),
  },
};

/** Offline: the add never settles while the network is gone. */
export const OfflineAddPending: Story = {
  args: { addAction: fn(() => new Promise<never>(() => {})) },
  play: async ({ canvasElement }) => clickFirstAdd(canvasElement),
};

/** Right-to-left: Arabic catalog rows in an Arabic document direction. */
export const RtlArabicCatalog: Story = {
  args: {
    clusters: [{ id: 1, slug: 'pitching', displayName: 'العروض التحريرية' }],
    catalog: [
      {
        slug: 'arabic-pitch',
        name: 'قدّم الإصدار لمحرري قوائم التشغيل',
        shortDescription: 'أرسل رابط الاستماع الخاص قبل أسبوع من الإصدار.',
        clusterId: 1,
        category: 'editorial',
      },
    ],
  },
  decorators: [
    function RtlDocument(Story) {
      return (
        <div dir='rtl' lang='ar'>
          <Story />
        </div>
      );
    },
  ],
};
