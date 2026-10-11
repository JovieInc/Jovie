import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { withDashboardProviders } from '@/.storybook/dashboard-fixtures';
import {
  DEFAULT_RELEASE_FILTERS,
  ReleaseTableSubheader,
} from './ReleaseTableSubheader';

const meta = {
  title: 'Dashboard/ReleaseTable/ReleaseTableSubheader',
  component: ReleaseTableSubheader,
  parameters: { layout: 'fullscreen' },
  args: {
    releases: [],
    allReleases: [],
    selectedIds: new Set<string>(),
    filters: DEFAULT_RELEASE_FILTERS,
    onFiltersChange: () => {},
    releaseView: 'releases' as const,
    onReleaseViewChange: () => {},
  },
  decorators: [withDashboardProviders],
} satisfies Meta<typeof ReleaseTableSubheader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
