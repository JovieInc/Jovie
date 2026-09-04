import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { PublicPageShell } from '@/components/site/PublicPageShell';
import { CliLandingPage } from './CliLandingPage';
import {
  MARKETING_STORY_DESCRIPTION,
  marketingFullscreenParameters,
} from './storybook/marketingStoryMeta';

/**
 * Adjacent ship-gate story for CliLandingPage. Desktop/mobile review
 * evidence lives at Marketing/Routes/cli.
 */
const meta = {
  title: 'Marketing/Components/CliLandingPage',
  component: CliLandingPage,
  parameters: {
    ...marketingFullscreenParameters,
    chromatic: { disable: true },
    docs: {
      description: {
        component: `${MARKETING_STORY_DESCRIPTION} Exact production body for /cli.`,
      },
    },
  },
} satisfies Meta<typeof CliLandingPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <PublicPageShell>
      <CliLandingPage />
    </PublicPageShell>
  ),
};
