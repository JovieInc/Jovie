import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { MarketingEditorialHeroPhoto } from './MarketingEditorialHeroPhoto';

const meta: Meta<typeof MarketingEditorialHeroPhoto> = {
  title: 'Marketing/Primitives/MarketingEditorialHeroPhoto',
  component: MarketingEditorialHeroPhoto,
  parameters: { layout: 'fullscreen' },
  decorators: [
    Story => (
      <div className='relative h-96 w-full overflow-hidden bg-base'>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

/** /blog and /changelog: a calm, mostly-dark frame at moderate opacity. */
export const Default: Story = {
  args: {
    src: '/images/hero/blog-index.webp',
    opacity: 0.4,
    testId: 'storybook-editorial-hero-photo',
  },
};

/** /changelog/[version]: a brighter frame held to a dark underlay at low
 * opacity so the docked header stays legible over it. */
export const DarkUnderlayLowOpacity: Story = {
  args: {
    src: '/images/hero/changelog-version.webp',
    opacity: 0.22,
    testId: 'storybook-editorial-hero-photo-underlay',
  },
};
