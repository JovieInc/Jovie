import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { HomepageProfilePhone } from './HomepageProfilePhone';

/** Tim White's real profile at the canonical 310px phone (Pen WyQJb). */
const meta = {
  title: 'Marketing/HomepageProfilePhone',
  component: HomepageProfilePhone,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof HomepageProfilePhone>;

export default meta;
type Story = StoryObj<typeof meta>;

export const TimWhite: Story = {
  args: {
    alt: 'Tim White’s Jovie profile.',
    release: {
      title: 'Never Say A Word',
      src: '/img/releases/never-say-a-word.jpg',
    },
  },
};
