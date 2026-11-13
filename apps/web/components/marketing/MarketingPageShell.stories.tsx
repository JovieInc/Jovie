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
  args: { children: null },
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

/** Long content: a long headline and an unbroken URL inside the page wrapper. */
export const LongContentPage: Story = {
  args: { children: null },
  render: () => (
    <MarketingPageShell className='bg-base text-primary-token'>
      <MarketingContainer width='page' className='py-16'>
        <div className='rounded-2xl border border-subtle bg-surface-1 p-8'>
          <h2 className='text-xl font-semibold text-primary-token'>
            Smart links, release pages, pre-saves and fan capture for
            independent artists, DJs, managers and labels everywhere
          </h2>
          <p className='mt-3 break-words text-sm leading-relaxed text-secondary-token'>
            https://jov.ie/release/midnight-drive-extended-club-mix-feat-maya-vale-deluxe-anniversary-edition-2026
          </p>
        </div>
      </MarketingContainer>
    </MarketingPageShell>
  ),
};

/** Right-to-left: an Arabic page inside the wrapper. */
export const RtlArabicPage: Story = {
  args: { children: null },
  render: () => (
    <div dir='rtl' lang='ar'>
      <MarketingPageShell className='bg-base text-primary-token'>
        <MarketingContainer width='page' className='py-16'>
          <div className='rounded-2xl border border-subtle bg-surface-1 p-8'>
            <h2 className='text-xl font-semibold text-primary-token'>
              غلاف صفحة التسويق
            </h2>
            <p className='mt-3 text-sm leading-relaxed text-secondary-token'>
              يملك الإطار العام الرأس والتذييل ورابط التخطي، ويكتفي هذا الغلاف
              بالنمو مع العمود الرئيسي.
            </p>
          </div>
        </MarketingContainer>
      </MarketingPageShell>
    </div>
  ),
};
