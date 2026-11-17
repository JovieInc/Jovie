import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, within } from 'storybook/test';
import type { ReleaseViewModel } from '@/lib/discography/types';
import { ReleaseTableExportButton } from './ReleaseTableExportButton';

const releases: ReleaseViewModel[] = [
  {
    profileId: 'story-profile',
    id: 'release-1',
    title: 'Skyline Dreams',
    slug: 'skyline-dreams',
    status: 'released',
    releaseType: 'single',
    isExplicit: false,
    releaseDate: '2026-01-01',
    totalTracks: 1,
    providers: [],
    spotifyPopularity: null,
    smartLinkPath: '/smart/release-1',
    previewUrl: null,
    primaryIsrc: null,
    upc: null,
  },
];

const withRtl: Decorator = Story => (
  <div dir='rtl'>
    <Story />
  </div>
);

const meta = {
  title:
    'Dashboard/Organisms/ReleaseProviderMatrix/ReleaseTableExportButton States',
  component: ReleaseTableExportButton,
  parameters: { layout: 'centered' },
  args: {
    releases,
    selectedIds: new Set<string>(),
  },
} satisfies Meta<typeof ReleaseTableExportButton>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: with no releases the button stays available and reports no data. */
export const EmptyNoReleases: Story = {
  args: { releases: [] },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole('button', {
        name: 'Export data to CSV file',
      })
    ).toBeEnabled();
  },
};

/** Right-to-left: the icon-only export button inside an RTL document. */
export const RtlExport: Story = {
  decorators: [withRtl],
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole('button', {
        name: 'Export data to CSV file',
      })
    ).toBeVisible();
  },
};
