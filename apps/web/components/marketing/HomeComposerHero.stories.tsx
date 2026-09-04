import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { HomeComposerHero } from './HomeComposerHero';
import { MarketingPageShell } from './MarketingPageShell';

const meta = {
  title: 'Marketing/Home/HomeComposerHero',
  component: HomeComposerHero,
  parameters: {
    layout: 'fullscreen',
    backgrounds: { default: 'dark' },
    jovie: {
      uncoveredProps: [
        'value',
        'label',
        'activeTab',
        'year',
        'artBg',
        'isActive',
        'stats',
        'eyebrow',
      ],
    },
  },
  decorators: [
    Story => (
      <MarketingPageShell className='min-h-screen bg-page'>
        <Story />
      </MarketingPageShell>
    ),
  ],
} satisfies Meta<typeof HomeComposerHero>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
