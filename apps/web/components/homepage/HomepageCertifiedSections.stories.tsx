import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { HOMEPAGE_LAUNCH_COPY } from '@/data/homepageLaunchCopy';
import { HOMEPAGE_MEDIA_MAP } from '@/data/homepageMediaMap';
import {
  HomepageCertifiedSections,
  HomepageEditorialFeatureSection,
} from './HomepageCertifiedSections';

// Same real public-profile exports the live homepage mounts (jov.ie/timwhite).
const previews = {
  subscribe: HOMEPAGE_MEDIA_MAP.relationships.asset,
  pay: HOMEPAGE_MEDIA_MAP.pay.asset,
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

// The record-owned renderer factory /solutions pages bind to: one real export,
// with the certified homepage copy standing in for a page record.
export const EditorialFeatureSingleExport: Story = {
  args: { previews },
  render: () => {
    const section = HOMEPAGE_LAUNCH_COPY.certified.sections[0];
    return (
      <HomepageEditorialFeatureSection
        previews={[{ image: previews.subscribe }]}
        section={{
          id: section.id,
          headline: section.headline,
          body: section.body,
        }}
      />
    );
  },
};
