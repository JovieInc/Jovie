import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { DspLinksLanding } from './DspLinksLanding';

const meta = {
  title: 'Marketing/Product/DspLinksLanding',
  component: DspLinksLanding,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Full /product/dsp-links landing page composition: headline, support copy, and the DSP links workflow for release distribution.',
      },
    },
  },
} satisfies Meta<typeof DspLinksLanding>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Landing: Story = {};
