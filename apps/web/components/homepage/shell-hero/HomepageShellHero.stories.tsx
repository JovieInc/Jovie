import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { HomepageShellHero } from './HomepageShellHero';

const meta: Meta<typeof HomepageShellHero> = {
  title: 'Marketing/Homepage/HomepageShellHero',
  component: HomepageShellHero,
  parameters: { layout: 'fullscreen' },
};

export default meta;
type Story = StoryObj<typeof meta>;

/** Rest frame: headline, support line, shell product shot, empty logo slot. */
export const Rest: Story = {};
