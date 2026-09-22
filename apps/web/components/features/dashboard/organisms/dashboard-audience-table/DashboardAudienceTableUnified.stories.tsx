import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { DashboardAudienceTableUnified } from './DashboardAudienceTableUnified';
import { DEFAULT_AUDIENCE_FILTERS } from './types';

const meta: Meta<typeof DashboardAudienceTableUnified> = {
  title: 'Dashboard/Audience/DashboardAudienceTableUnified',
  component: DashboardAudienceTableUnified,
  parameters: {
    layout: 'fullscreen',
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {
  args: {
    mode: 'members',
    view: 'all',
    rows: [],
    total: 0,
    sort: 'lastSeen',
    direction: 'desc',
    onSortChange: () => undefined,
    onViewChange: () => undefined,
    onFiltersChange: () => undefined,
    filters: DEFAULT_AUDIENCE_FILTERS,
    subscriberCount: 0,
  },
};
