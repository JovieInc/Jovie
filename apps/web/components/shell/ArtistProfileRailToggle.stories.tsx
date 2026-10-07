import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { withDashboardProviders } from '@/.storybook/dashboard-fixtures';
import { ArtistProfileRailToggle } from './ArtistProfileRailToggle';

const meta = {
  title: 'Shell/ArtistProfileRailToggle',
  component: ArtistProfileRailToggle,
  parameters: {
    layout: 'centered',
  },
  decorators: [withDashboardProviders],
} satisfies Meta<typeof ArtistProfileRailToggle>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
