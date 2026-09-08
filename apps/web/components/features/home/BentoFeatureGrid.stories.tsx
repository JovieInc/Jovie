import type { Meta } from '@storybook/nextjs-vite';
import { BentoFeatureGrid } from './BentoFeatureGrid';

const meta = {
  title: 'Marketing/BentoFeatureGrid',
  component: BentoFeatureGrid,
  parameters: {
    jovie: { uncoveredProps: ['heading'] },
  },
} satisfies Meta<typeof BentoFeatureGrid>;

export default meta;

export const Default = {};
