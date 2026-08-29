import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { MarketingContainer } from './MarketingContainer';
import { MarketingPageShell } from './MarketingPageShell';

const meta = {
  title: 'Marketing/Primitives/MarketingPageShell',
  component: MarketingPageShell,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof MarketingPageShell>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <MarketingPageShell className='bg-base text-primary-token'>
      <MarketingContainer width='page' className='py-16'>
        <div className='rounded-2xl border border-subtle bg-surface-1 p-8'>
          <h2 className='text-xl font-semibold text-primary-token'>
            Marketing page shell
          </h2>
          <p className='mt-3 text-sm leading-relaxed text-secondary-token'>
            PublicPageShell owns header, footer, skip link, and viewport height.
            This wrapper only grows with the main column and gives page-scoped
            class hooks a relative positioning context.
          </p>
        </div>
      </MarketingContainer>
    </MarketingPageShell>
  ),
};
