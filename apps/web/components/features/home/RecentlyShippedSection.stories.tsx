import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { RecentlyShippedReleases } from './RecentlyShippedReleases';

// RecentlyShippedSection reads CHANGELOG.md through node:fs on the server;
// the story renders its presentational half from parsed releases.
const meta = {
  title: 'Marketing/RecentlyShippedSection',
  component: RecentlyShippedReleases,
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    releases: [
      {
        version: '26.10.0',
        date: '2026-10-01',
        highlights: [
          'Launch notifications for every release',
          'Faster public profiles',
        ],
      },
      {
        version: '26.9.16',
        date: '2026-09-28',
        highlights: ['Claim your profile link from the homepage'],
      },
      {
        version: '26.9.15',
        date: '2026-09-24',
        highlights: ['Smart links for scheduled releases'],
      },
    ],
  },
} satisfies Meta<typeof RecentlyShippedReleases>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
