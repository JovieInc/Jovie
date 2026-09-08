import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { HomepageCertifiedExposure } from './HomepageCertifiedExposure';

const meta = {
  title: 'Marketing/HomepageCertifiedExposure',
  component: HomepageCertifiedExposure,
  parameters: {
    docs: {
      description: {
        component:
          'Anonymous homepage exposure receipt for the certified name-search variant. Renders nothing.',
      },
    },
  },
} satisfies Meta<typeof HomepageCertifiedExposure>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
