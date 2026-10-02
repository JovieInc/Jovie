import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import {
  MARKETING_STORY_DESCRIPTION,
  marketingFullscreenParameters,
} from '../marketing/storybook/marketingStoryMeta';
import { AboutPageRefresh } from './AboutPageRefresh';

const meta = {
  title: 'Marketing/Routes/About Refresh',
  component: AboutPageRefresh,
  parameters: {
    ...marketingFullscreenParameters,
    docs: {
      description: {
        component: `${MARKETING_STORY_DESCRIPTION} Flagged About body. Production renders this only when SHOW_PUBLIC_ABOUT_FOOTER_REFRESH is on.`,
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof AboutPageRefresh>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Flagged: Story = {};
