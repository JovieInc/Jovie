import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { FEATURE_CARD_VARIANTS } from '@/lib/sections/variants/feature-card';
import { SectionVariantPreview } from '../SectionVariantPreview';

const meta: Meta<typeof SectionVariantPreview> = {
  title: 'Design Studio/Sections/Feature Card',
  component: SectionVariantPreview,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
  argTypes: {
    variantId: {
      control: { type: 'select' },
      options: FEATURE_CARD_VARIANTS.map(variant => variant.id),
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Grid3Up: Story = {
  args: {
    variantId: 'feature-card-grid-3up',
  },
};

export const Grid3UpDarkSurface: Story = {
  args: {
    ...Grid3Up.args,
  },
  parameters: {
    backgrounds: { default: 'dark' },
  },
};
