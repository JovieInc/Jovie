import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { TESTIMONIAL_VARIANTS } from '@/lib/sections/variants/testimonial';
import { SectionVariantPreview } from '../SectionVariantPreview';

const meta: Meta<typeof SectionVariantPreview> = {
  title: 'Design Studio/Sections/Testimonial',
  component: SectionVariantPreview,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
  argTypes: {
    variantId: {
      control: { type: 'select' },
      options: TESTIMONIAL_VARIANTS.map(variant => variant.id),
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Grid3Up: Story = {
  args: {
    variantId: 'testimonial-card-3up',
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
