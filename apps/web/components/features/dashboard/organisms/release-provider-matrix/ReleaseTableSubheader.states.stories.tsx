import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { withDashboardProviders } from '@/.storybook/dashboard-fixtures';
import type { ReleaseViewModel } from '@/lib/discography/types';
import {
  DEFAULT_RELEASE_FILTERS,
  ReleaseTableSubheader,
} from './ReleaseTableSubheader';

const LONG_LABEL =
  'Northern Coastline Independent Recordings and Publishing Cooperative International';

function createRelease(
  id: string,
  overrides: Record<string, unknown> = {}
): ReleaseViewModel {
  return {
    profileId: 'story-profile',
    id,
    title: `Release ${id}`,
    slug: id,
    status: 'released',
    releaseType: 'single',
    isExplicit: false,
    releaseDate: '2026-01-01',
    totalTracks: 1,
    providers: [],
    spotifyPopularity: 72,
    smartLinkPath: `/smart/${id}`,
    previewUrl: null,
    primaryIsrc: null,
    upc: null,
    label: 'Jovie Records',
    ...overrides,
  } as unknown as ReleaseViewModel;
}

const sparseReleases = [
  createRelease('release-1', { label: null, spotifyPopularity: null }),
  createRelease('release-2', { label: null, spotifyPopularity: null }),
];

const longReleases = Array.from({ length: 24 }, (_, index) =>
  createRelease(`release-${index + 1}`, {
    title: `Skyline Dreams Volume ${index + 1} (Remastered Deluxe Edition)`,
    label: `${LONG_LABEL} ${index + 1}`,
    releaseType: index % 2 === 0 ? 'album' : 'ep',
  })
);

const withRtl: Decorator = Story => (
  <div dir='rtl'>
    <Story />
  </div>
);

const withNarrowColumn: Decorator = Story => (
  <div className='w-80'>
    <Story />
  </div>
);

const meta = {
  title: 'Dashboard/ReleaseTable/ReleaseTableSubheader States',
  component: ReleaseTableSubheader,
  parameters: { layout: 'fullscreen' },
  args: {
    releases: [],
    allReleases: [],
    selectedIds: new Set<string>(),
    filters: DEFAULT_RELEASE_FILTERS,
    onFiltersChange: fn(),
    releaseView: 'releases' as const,
    onReleaseViewChange: fn(),
  },
  decorators: [withDashboardProviders],
} satisfies Meta<typeof ReleaseTableSubheader>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: no releases, so the toolbar still offers the view switch and actions. */
export const EmptyNoReleases: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByRole('button', { name: 'Export data to CSV file' })
    ).toBeVisible();
    await userEvent.click(canvas.getByText('Tracks'));
    await expect(args.onReleaseViewChange).toHaveBeenCalledWith('tracks');
  },
};

/** Partial: no view handler and releases without labels or popularity. */
export const PartialWithoutViewSwitch: Story = {
  args: {
    releases: sparseReleases,
    allReleases: sparseReleases,
    onReleaseViewChange: undefined,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByText('Tracks')).toBeNull();
    await expect(
      canvas.getByRole('button', { name: 'Toggle release preview' })
    ).toBeVisible();
  },
};

/** Long content: a large catalog with long labels in a narrow column. */
export const LongContentManyReleases: Story = {
  args: {
    releases: longReleases,
    allReleases: longReleases,
    selectedIds: new Set(longReleases.map(release => release.id)),
  },
  decorators: [withNarrowColumn],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Releases')).toBeVisible();
    await expect(
      await canvas.findByRole('button', { name: 'Export data to CSV file' })
    ).toBeEnabled();
  },
};

/** Right-to-left: the toolbar inside an RTL document. */
export const RtlToolbar: Story = {
  args: { releaseView: 'tracks' as const },
  decorators: [withRtl],
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByText('Releases'));
    await expect(args.onReleaseViewChange).toHaveBeenCalledWith('releases');
  },
};
