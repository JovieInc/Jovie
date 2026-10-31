import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import analyticsMeta from './Analytics.stories';
import { GoogleAnalytics } from './GoogleAnalytics';

const meta = {
  ...analyticsMeta,
  title: 'Providers/GoogleAnalytics',
  component: GoogleAnalytics,
} satisfies Meta<typeof GoogleAnalytics>;
export default meta;
export const Default: StoryObj<typeof meta> = {};
