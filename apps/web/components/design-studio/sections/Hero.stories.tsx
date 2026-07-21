import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { HERO_VARIANTS } from '@/lib/sections/variants/hero';
import { SectionVariantPreview } from '../SectionVariantPreview';

const meta: Meta<typeof SectionVariantPreview> = {
  title: 'Design Studio/Sections/Hero',
  component: SectionVariantPreview,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
  argTypes: {
    variantId: {
      control: { type: 'select' },
      options: HERO_VARIANTS.map(variant => variant.id),
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Canonical: Story = {
  args: {
    variantId: 'marketing-hero',
  },
};

export const CanonicalDarkSurface: Story = {
  args: {
    ...Canonical.args,
  },
  parameters: {
    backgrounds: { default: 'dark' },
  },
};
