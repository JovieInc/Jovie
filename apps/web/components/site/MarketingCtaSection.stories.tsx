import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { MarketingCtaSection } from './MarketingCtaSection';

const meta = {
  title: 'Site/MarketingCtaSection',
  component: MarketingCtaSection,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Native section boundary used by production CTA owners. Content, layout and behavior belong to callers. This isolated boundary specimen does not certify a route, variant or Pen identity.',
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof MarketingCtaSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NativeSection: Story = {
  args: {
    'aria-label': 'CTA section boundary specimen',
  },
  render: args => (
    <MarketingCtaSection {...args}>
      <p>Caller-owned CTA content.</p>
    </MarketingCtaSection>
  ),
};
