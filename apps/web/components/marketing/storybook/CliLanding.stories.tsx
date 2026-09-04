import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { CliLandingPage } from '@/components/marketing/CliLandingPage';
import { PublicPageShell } from '@/components/site/PublicPageShell';
import {
  MARKETING_STORY_DESCRIPTION,
  marketingFullscreenParameters,
  recipeViewports,
} from './marketingStoryMeta';

/**
 * Source-backed /cli review gallery. Desktop 1440×900 and mobile 390×844
 * match VISUAL_QA_VIEWPORTS / recipeViewports.
 */
const meta = {
  title: 'Marketing/Routes/cli',
  parameters: {
    ...marketingFullscreenParameters,
    viewport: {
      viewports: recipeViewports,
      defaultViewport: 'desktop',
    },
    docs: {
      description: {
        component: `${MARKETING_STORY_DESCRIPTION} Canonical /cli landing page.`,
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj;

function CliReviewFrame() {
  return (
    <PublicPageShell>
      <CliLandingPage />
    </PublicPageShell>
  );
}

export const desktop: Story = {
  name: 'desktop',
  parameters: {
    viewport: { defaultViewport: 'desktop' },
    chromatic: { viewports: [1440] },
  },
  render: () => <CliReviewFrame />,
};

export const mobile: Story = {
  name: 'mobile',
  parameters: {
    viewport: { defaultViewport: 'mobile' },
    chromatic: { viewports: [390] },
  },
  render: () => <CliReviewFrame />,
};
