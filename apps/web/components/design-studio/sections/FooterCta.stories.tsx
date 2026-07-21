import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { FOOTER_CTA_VARIANTS } from '@/lib/sections/variants/footer-cta';
import { SectionVariantPreview } from '../SectionVariantPreview';

const meta: Meta<typeof SectionVariantPreview> = {
  title: 'Design Studio/Sections/Footer CTA',
  component: SectionVariantPreview,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
  argTypes: {
    variantId: {
      control: { type: 'select' },
      options: FOOTER_CTA_VARIANTS.map(variant => variant.id),
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    variantId: 'marketing-final-cta-default',
  },
};

export const WithSecondary: Story = {
  args: {
    variantId: 'marketing-final-cta-with-secondary',
  },
};

export const DefaultDarkSurface: Story = {
  args: {
    ...Default.args,
  },
  parameters: {
    backgrounds: { default: 'dark' },
  },
};

export const AllVariants: Story = {
  render: () => (
    <div className='flex flex-col gap-8'>
      {FOOTER_CTA_VARIANTS.map(variant => (
        <SectionVariantPreview key={variant.id} variantId={variant.id} />
      ))}
    </div>
  ),
};
