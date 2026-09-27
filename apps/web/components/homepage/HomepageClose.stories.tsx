import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { HomepageClose } from './HomepageClose';

const meta = {
  title: 'Marketing/HomepageClose',
  component: HomepageClose,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Canonical Pen homepage close: "Make it your Jovie profile." with the same Request access action as the header and hero (name-search focus while the waitlist is off).',
      },
    },
  },
} satisfies Meta<typeof HomepageClose>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {},
};
