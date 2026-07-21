import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { HEADER_VARIANTS } from '@/lib/sections/variants/header';
import { SectionVariantPreview } from '../SectionVariantPreview';

const meta: Meta<typeof SectionVariantPreview> = {
  title: 'Design Studio/Sections/Header',
  component: SectionVariantPreview,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
  argTypes: {
    variantId: {
      control: { type: 'select' },
      options: HEADER_VARIANTS.map(variant => variant.id),
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Landing: Story = {
  args: {
    variantId: 'marketing-header-landing',
  },
};

export const Content: Story = {
  args: {
    variantId: 'marketing-header-content',
  },
};

export const Minimal: Story = {
  args: {
    variantId: 'marketing-header-minimal',
  },
};

export const Homepage: Story = {
  args: {
    variantId: 'marketing-header-homepage',
  },
};

export const LandingDarkSurface: Story = {
  args: {
    ...Landing.args,
  },
  parameters: {
    backgrounds: { default: 'dark' },
  },
};

export const AllVariants: Story = {
  render: () => (
    <div className='flex flex-col gap-8'>
      {HEADER_VARIANTS.map(variant => (
        <SectionVariantPreview key={variant.id} variantId={variant.id} />
      ))}
    </div>
  ),
};
