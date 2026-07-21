import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { FOOTER_VARIANTS } from '@/lib/sections/variants/footer';
import { SectionVariantPreview } from '../SectionVariantPreview';

const meta: Meta<typeof SectionVariantPreview> = {
  title: 'Design Studio/Sections/Footer',
  component: SectionVariantPreview,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
  argTypes: {
    variantId: {
      control: { type: 'select' },
      options: FOOTER_VARIANTS.map(variant => variant.id),
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Expanded: Story = {
  args: {
    variantId: 'marketing-footer-expanded',
  },
};

export const Minimal: Story = {
  args: {
    variantId: 'marketing-footer-minimal',
  },
};

export const ExpandedDarkSurface: Story = {
  args: {
    ...Expanded.args,
  },
  parameters: {
    backgrounds: { default: 'dark' },
  },
};

export const AllVariants: Story = {
  render: () => (
    <div className='flex flex-col gap-8'>
      {FOOTER_VARIANTS.map(variant => (
        <SectionVariantPreview key={variant.id} variantId={variant.id} />
      ))}
    </div>
  ),
};
