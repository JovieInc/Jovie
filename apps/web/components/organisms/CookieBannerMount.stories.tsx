import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { CookieBannerMount } from './CookieBannerMount';

const meta = {
  title: 'Organisms/CookieBannerMount',
  component: CookieBannerMount,
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof CookieBannerMount>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
