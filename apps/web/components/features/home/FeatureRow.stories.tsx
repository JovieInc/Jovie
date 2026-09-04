import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { FeatureRow } from './FeatureRow';

const meta = {
  title: 'Marketing/Sections/FeatureRow',
  component: FeatureRow,
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    heading: 'Route every fan to the right action.',
    description:
      'One adaptive profile can sell tickets, collect subscribers, or send fans to a release.',
    bullets: ['Smart links per release', 'Audience owned by the artist'],
    screenshotSrc: '/product-screenshots/profile-desktop.png',
    screenshotAlt: 'Jovie profile dashboard preview',
    screenshotWidth: 1440,
    screenshotHeight: 900,
  },
} satisfies Meta<typeof FeatureRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
