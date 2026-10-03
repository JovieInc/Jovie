import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { HOMEPAGE_V2_COPY } from '@/data/homepageV2Copy';
import {
  HomepageStoryHeader,
  HomepageV2FinalCta,
  HomepageV2Pricing,
} from './HomepageV2Ctas';

const meta = {
  title: 'Marketing/Homepage V2/HomepageV2Ctas',
  component: HomepageV2FinalCta,
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof HomepageV2FinalCta>;

export default meta;
type Story = StoryObj<typeof meta>;

export const FinalCta: Story = {};

export const Pricing: StoryObj<typeof HomepageV2Pricing> = {
  render: () => <HomepageV2Pricing />,
};

export const StoryHeader: StoryObj<typeof HomepageStoryHeader> = {
  render: () => (
    <HomepageStoryHeader
      headline={HOMEPAGE_V2_COPY.pricing.headline}
      body='Jovie profiles are free forever.'
    />
  ),
};
