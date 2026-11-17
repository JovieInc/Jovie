import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Section } from './Section';

const meta = {
  title: 'Molecules/Section/States',
  component: Section,
  parameters: { layout: 'fullscreen' },
  args: { children: null },
} satisfies Meta<typeof Section>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Partial: children only, with padding and container at their defaults. */
export const PartialChildrenOnly: Story = {
  args: {
    children: <p className='text-center text-primary-token'>Section body</p>,
  },
};

/** Long content: a long paragraph on the grid background with a border. */
export const LongContentGridBorder: Story = {
  args: {
    withGridBg: true,
    withBorder: true,
    padding: 'md',
    children: (
      <p className='mx-auto max-w-2xl text-secondary-token'>
        Plan every release, create the assets it needs, pitch playlists and
        promote each drop from one workspace, with listen links for every
        service and a page for every release that stays in step with the catalog
        as dates move, artwork changes and new services go live.
      </p>
    ),
  },
};

/** RTL: Arabic copy in a right-to-left section. */
export const RtlArabicCopy: Story = {
  args: {
    padding: 'sm',
    dir: 'rtl',
    lang: 'ar',
    children: (
      <p className='text-center text-primary-token'>
        خطط لكل إصدار من مساحة عمل واحدة.
      </p>
    ),
  },
};
