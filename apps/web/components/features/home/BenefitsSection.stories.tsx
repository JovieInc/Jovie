import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { BenefitsSection } from './BenefitsSection';

const meta = {
  title: 'Features/Home/BenefitsSection',
  component: BenefitsSection,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Legacy re-export of the canonical @/components/organisms/BenefitsSection.',
      },
    },
  },
} satisfies Meta<typeof BenefitsSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
