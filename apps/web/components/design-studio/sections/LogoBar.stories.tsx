import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { LOGO_BAR_VARIANTS } from '@/lib/sections/variants/logo-bar';
import { SectionVariantPreview } from '../SectionVariantPreview';

const meta: Meta<typeof SectionVariantPreview> = {
  title: 'Design Studio/Sections/Logo Bar',
  component: SectionVariantPreview,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
  argTypes: {
    variantId: {
      control: { type: 'select' },
      options: LOGO_BAR_VARIANTS.map(variant => variant.id),
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Card: Story = {
  args: {
    variantId: 'home-trust-default',
  },
};

export const CompactCard: Story = {
  args: {
    variantId: 'home-trust-compact',
  },
};

export const InlineStrip: Story = {
  args: {
    variantId: 'home-trust-inline',
  },
};

export const CardDarkSurface: Story = {
  args: {
    ...Card.args,
  },
  parameters: {
    backgrounds: { default: 'dark' },
  },
};

export const AllVariants: Story = {
  render: () => (
    <div className='flex flex-col gap-8'>
      {LOGO_BAR_VARIANTS.map(variant => (
        <SectionVariantPreview key={variant.id} variantId={variant.id} />
      ))}
    </div>
  ),
};
