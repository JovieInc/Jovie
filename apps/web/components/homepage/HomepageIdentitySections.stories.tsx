import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { HomepageIdentitySections } from './HomepageIdentitySections';

const meta = {
  title: 'Marketing/HomepageIdentitySections',
  component: HomepageIdentitySections,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Canonical Pen homepage v3 body (dark launch): "Your presence, resolved." with the purple satin strip (used once) and "A clear next step.", then "Structure that travels." with the open anatomy of your Jovie profile.',
      },
    },
  },
} satisfies Meta<typeof HomepageIdentitySections>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
