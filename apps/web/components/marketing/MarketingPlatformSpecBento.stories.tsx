import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { MarketingPageShell } from './MarketingPageShell';
import { MarketingPlatformSpecBento } from './MarketingPlatformSpecBento';

const meta: Meta<typeof MarketingPlatformSpecBento> = {
  title: 'Marketing/Primitives/MarketingPlatformSpecBento',
  component: MarketingPlatformSpecBento,
  parameters: { layout: 'fullscreen' },
  decorators: [
    Story => (
      <MarketingPageShell>
        <Story />
      </MarketingPageShell>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
