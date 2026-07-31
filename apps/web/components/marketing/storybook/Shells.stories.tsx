/**
 * Marketing shells and chrome — PublicPageShell, containers, header/footer/CTA.
 *
 * @see apps/web/components/site/PublicPageShell.tsx
 * @see apps/web/components/marketing/MarketingPageShell.tsx
 */

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import {
  MarketingContainer,
  MarketingContentShell,
  MarketingHero,
  MarketingPageShell,
} from '@/components/marketing';
import { MarketingFinalCTA } from '@/components/site/MarketingFinalCTA';
import { MarketingFooter } from '@/components/site/MarketingFooter';
import { MarketingFooterCta } from '@/components/site/MarketingFooterCta';
import { MarketingHeader } from '@/components/site/MarketingHeader';
import { PublicPageShell } from '@/components/site/PublicPageShell';
import { APP_ROUTES } from '@/constants/routes';
import { MarketingStorySurface } from './story-surface';

// Title must be a string literal so Storybook's static indexer can parse CSF.
const meta: Meta = {
  title: 'Marketing/Shells',
  parameters: {
    layout: 'fullscreen',
    backgrounds: { default: 'dark' },
    docs: {
      description: {
        component:
          'Shared marketing/public shells and chrome. Dark-only product surfaces. Fully static marketing pages use revalidate = false.',
      },
    },
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj;

export const PublicPageShellStory: Story = {
  name: 'PublicPageShell',
  parameters: {
    docs: {
      description: {
        story:
          'Canonical public marketing shell: skip link, header, main offset, footer.',
      },
    },
  },
  render: () => (
    <MarketingStorySurface label='shell-public-page'>
      <PublicPageShell>
        <MarketingHero
          headingId='storybook-public-shell-hero'
          headline='Public page shell'
          subtitle='Header, main content offset, and footer from the product shell.'
          primaryCta={{ label: 'Get started', href: APP_ROUTES.SIGNUP }}
          logos={false}
        />
        <MarketingContainer width='page' className='pb-16'>
          <p className='text-sm text-secondary-token'>
            Content renders inside the public main region with the fixed-header
            offset contract.
          </p>
        </MarketingContainer>
      </PublicPageShell>
    </MarketingStorySurface>
  ),
};

export const MarketingPageShellStory: Story = {
  name: 'MarketingPageShell',
  render: () => (
    <MarketingStorySurface label='shell-marketing-page'>
      <MarketingPageShell>
        <MarketingContainer width='page' className='py-16'>
          <h1 className='text-3xl font-semibold text-primary-token'>
            Marketing page shell
          </h1>
          <p className='mt-4 max-w-2xl text-secondary-token'>
            Minimal full-height marketing page wrapper used by landing routes
            that own their own header chrome.
          </p>
        </MarketingContainer>
      </MarketingPageShell>
    </MarketingStorySurface>
  ),
};

export const MarketingContentShellStory: Story = {
  name: 'MarketingContentShell',
  render: () => (
    <MarketingStorySurface label='shell-marketing-content'>
      <MarketingContentShell>
        <h1 className='text-3xl font-semibold text-primary-token'>
          Content shell
        </h1>
        <p className='mt-4'>
          Prose-width shell for about, support, and long-form marketing pages.
        </p>
      </MarketingContentShell>
    </MarketingStorySurface>
  ),
};

export const MarketingContainerStory: Story = {
  name: 'MarketingContainer',
  render: () => (
    <MarketingStorySurface label='shell-marketing-container'>
      <div className='space-y-10 py-12'>
        <MarketingContainer width='page'>
          <div className='rounded-xl border border-subtle bg-surface-1 p-6'>
            <p className='text-sm font-medium text-primary-token'>
              width=&apos;page&apos;
            </p>
            <p className='mt-2 text-sm text-secondary-token'>
              Canonical public content max width.
            </p>
          </div>
        </MarketingContainer>
        <MarketingContainer width='prose'>
          <div className='rounded-xl border border-subtle bg-surface-1 p-6'>
            <p className='text-sm font-medium text-primary-token'>
              width=&apos;prose&apos;
            </p>
            <p className='mt-2 text-sm text-secondary-token'>
              Canonical prose max width for long-form.
            </p>
          </div>
        </MarketingContainer>
        <MarketingContainer width='landing'>
          <div className='rounded-xl border border-subtle bg-surface-1 p-6'>
            <p className='text-sm font-medium text-primary-token'>
              width=&apos;landing&apos;
            </p>
            <p className='mt-2 text-sm text-secondary-token'>
              Legacy alias of page width (same token).
            </p>
          </div>
        </MarketingContainer>
      </div>
    </MarketingStorySurface>
  ),
};

export const HeaderFooterChrome: Story = {
  name: 'HeaderFooterChrome',
  render: () => (
    <MarketingStorySurface label='shell-header-footer'>
      <div className='flex min-h-screen flex-col'>
        <MarketingHeader variant='landing' logoSize='xs' />
        <main className='flex-1 px-6 py-16'>
          <p className='text-sm text-secondary-token'>
            Isolated header + footer chrome (product components).
          </p>
        </main>
        <MarketingFooter />
      </div>
    </MarketingStorySurface>
  ),
};

export const FinalCta: Story = {
  name: 'FinalCta',
  render: () => (
    <MarketingStorySurface label='shell-final-cta'>
      <div className='space-y-16 py-8'>
        <MarketingFinalCTA
          title='Request private launch access.'
          ctaLabel='Request Access'
          ctaHref={APP_ROUTES.SIGNUP}
        />
        <MarketingFooterCta
          title='Request Access to Jovie.'
          ctaLabel='Get started'
          ctaHref={APP_ROUTES.SIGNUP}
        />
      </div>
    </MarketingStorySurface>
  ),
};
