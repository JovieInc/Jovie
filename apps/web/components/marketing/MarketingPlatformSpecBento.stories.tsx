import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { MarketingPageShell } from './MarketingPageShell';
import { MarketingPlatformSpecBento } from './MarketingPlatformSpecBento';

const meta: Meta<typeof MarketingPlatformSpecBento> = {
  title: 'Marketing/Primitives/MarketingPlatformSpecBento',
  component: MarketingPlatformSpecBento,
  parameters: { layout: 'fullscreen' },
  decorators: [
    Story => (
      // Production marketing routes wrap content in .system-b-marketing (see
      // app/(marketing)/layout.tsx), which selects the higher-contrast System
      // B accent ramp (accent-purple #a982ff). Without it the tile titles
      // fall back to #8e56f5, which fails WCAG AA on the tile surface.
      <MarketingPageShell className='system-b-marketing'>
        <Story />
      </MarketingPageShell>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
