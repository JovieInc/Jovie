import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { FAQ_VARIANTS } from '@/lib/sections/variants/faq';
import { SectionVariantPreview } from '../SectionVariantPreview';

const meta: Meta<typeof SectionVariantPreview> = {
  title: 'Design Studio/Sections/FAQ',
  component: SectionVariantPreview,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
  argTypes: {
    variantId: {
      control: { type: 'select' },
      options: FAQ_VARIANTS.map(variant => variant.id),
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Accordion: Story = {
  args: {
    variantId: 'faq-section-default',
  },
};

export const AccordionDarkSurface: Story = {
  args: {
    ...Accordion.args,
  },
  parameters: {
    backgrounds: { default: 'dark' },
  },
};
