import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { MarketingScreenshot } from './MarketingScreenshot';

/** Rendered states of the registry screenshot; defaults live in MarketingScreenshot.stories.tsx. */
const meta = {
  title: 'Marketing/MarketingScreenshot States',
  component: MarketingScreenshot,
  parameters: { layout: 'centered' },
  args: {
    scenarioId: 'dashboard-audience-desktop',
    width: 720,
    height: 450,
  },
} satisfies Meta<typeof MarketingScreenshot>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Partial: only the scenario, so alt text, sizes and chrome come from defaults. */
export const PartialRegistryDefaults: Story = {};

/** Long content: a long window title and a long alt override. */
export const LongContentWindowTitle: Story = {
  args: {
    chrome: 'window',
    title:
      'Audience, sources, segments and every follow-up for the current release',
    altOverride:
      'Audience CRM showing a fan table with source tracking, segments, consent state and the next follow-up for every listener',
  },
};

/** Right-to-left: an Arabic window title in an Arabic document direction. */
export const RtlArabic: Story = {
  args: {
    chrome: 'window',
    title: 'الجمهور',
    altOverride: 'جدول المعجبين مع مصادر التتبع والشرائح',
  },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
};
