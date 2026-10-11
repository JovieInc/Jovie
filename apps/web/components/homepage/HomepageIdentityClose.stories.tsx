import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { HomepageIdentityClose } from './HomepageIdentityClose';

const meta = {
  title: 'Marketing/HomepageIdentityClose',
  component: HomepageIdentityClose,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Canonical Pen homepage v3 close (dark launch): "Make it your Jovie profile." with the same Request access action as the header and hero.',
      },
    },
  },
} satisfies Meta<typeof HomepageIdentityClose>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
