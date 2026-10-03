import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { HomepageElectricSeam } from './HomepageElectricSeam';

/**
 * `HomepageElectricSeam` re-exports `MarketingElectricSeam` under the
 * import path `ArtistProfileHero` and homepage callers use. Covered here
 * so the homepage/ alias has its own story, separate from the underlying
 * `Marketing/MarketingElectricSeam` component.
 */
const meta = {
  title: 'Marketing/HomepageElectricSeam',
  component: HomepageElectricSeam,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof HomepageElectricSeam>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    idSeed: 'storybook-homepage-electric-seam',
  },
};

export const NoSpark: Story = {
  args: {
    idSeed: 'storybook-homepage-electric-seam-no-spark',
    spark: false,
  },
};
