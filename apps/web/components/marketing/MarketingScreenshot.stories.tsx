import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { MarketingScreenshot } from './MarketingScreenshot';

const meta = {
  title: 'Marketing/MarketingScreenshot',
  component: MarketingScreenshot,
  parameters: {
    layout: 'centered',
  },
  args: {
    scenarioId: 'dashboard-audience-desktop',
    altOverride:
      'Audience CRM showing fan table with source tracking and segments',
    title: 'Audience',
    width: 720,
    height: 450,
  },
} satisfies Meta<typeof MarketingScreenshot>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WindowChrome: Story = {
  args: {
    chrome: 'window',
  },
};

export const MinimalChrome: Story = {
  args: {
    chrome: 'minimal',
  },
};
