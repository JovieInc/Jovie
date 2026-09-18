import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { MarketingCatalogPage } from './MarketingCatalogPage';

const meta = {
  title: 'Marketing/Components/MarketingCatalogPage',
  component: MarketingCatalogPage,
  parameters: { layout: 'fullscreen' },
  args: {
    eyebrow: 'Compare',
    title: 'Jovie vs the tools you already know',
    description:
      'See how Jovie compares with the tools musicians already use for links, releases, and fan capture.',
    listHeading: 'Comparisons',
    items: [
      {
        href: '/compare/linktree',
        title: 'Jovie vs Linktree',
        description: 'Where a music-first link-in-bio fits.',
      },
      {
        href: '/compare/linkfire',
        title: 'Jovie vs Linkfire',
        description: 'Release links with fan capture built in.',
      },
    ],
  },
} satisfies Meta<typeof MarketingCatalogPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
