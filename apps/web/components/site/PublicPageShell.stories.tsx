import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { marketingFullscreenParameters } from '@/components/marketing/storybook/marketingStoryMeta';
import { PublicPageShell } from './PublicPageShell';

const meta = {
  title: 'Site/PublicPageShell',
  component: PublicPageShell,
  parameters: {
    ...marketingFullscreenParameters,
    docs: {
      description: {
        component:
          'Adjacent component coverage for the canonical shell.public-page story. Header, main offset, skip link, and footer remain composed from their canonical owners.',
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof PublicPageShell>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <PublicPageShell footerVariant='minimal' mainOffset={false}>
      <section className='bg-base px-6 py-16 text-primary-token'>
        <div className='mx-auto max-w-public-content'>
          <h1 className='text-3xl font-semibold'>Public page content</h1>
          <p className='mt-4 max-w-prose-canonical text-secondary-token'>
            The shell keeps navigation, skip access, main content, and footer
            composition in one public route frame.
          </p>
        </div>
      </section>
    </PublicPageShell>
  ),
};

export const MinimalHeaderWithoutSkipLink: Story = {
  render: () => (
    <PublicPageShell
      footerVariant='minimal'
      headerVariant='minimal'
      mainOffset={false}
      skipToContent={false}
    >
      <section className='bg-base px-6 py-16 text-primary-token'>
        <div className='mx-auto max-w-public-content'>
          <h1 className='text-3xl font-semibold'>Minimal public frame</h1>
          <p className='mt-4 max-w-prose-canonical text-secondary-token'>
            Compact routes can opt out of the fixed-header offset and skip link
            when their surrounding layout owns those affordances.
          </p>
        </div>
      </section>
    </PublicPageShell>
  ),
};
