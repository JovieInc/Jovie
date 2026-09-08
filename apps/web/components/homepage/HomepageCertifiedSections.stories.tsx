import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { getMarketingExportImage } from '@/lib/screenshots/registry';
import { HomepageCertifiedSections } from './HomepageCertifiedSections';

// Same real public-profile exports the live homepage mounts (jov.ie/timwhite).
const previews = {
  connected: getMarketingExportImage('tim-white-profile-listen-mobile'),
  relationships: [
    getMarketingExportImage('tim-white-profile-subscribe-mobile'),
    getMarketingExportImage('tim-white-profile-pay-mobile'),
    getMarketingExportImage('tim-white-profile-tour-mobile'),
  ],
} as const;

const meta = {
  title: 'Marketing/HomepageCertifiedSections',
  component: HomepageCertifiedSections,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Sections 2-8 of the certified homepage: one quiet proof statement, then six top-ruled editorial sections on the shared content column, alternating sides, with real product exports where they exist and nothing where they do not.',
      },
    },
  },
} satisfies Meta<typeof HomepageCertifiedSections>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    previews,
  },
};
