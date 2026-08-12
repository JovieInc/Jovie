import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { MarketingContainer } from '@/components/marketing/MarketingContainer';
import { MarketingContentShell } from '@/components/marketing/MarketingContentShell';
import { MarketingFinalCTA } from '@/components/site/MarketingFinalCTA';
import { MarketingFooter } from '@/components/site/MarketingFooter';
import { MarketingFooterCta } from '@/components/site/MarketingFooterCta';
import { MarketingHeader } from '@/components/site/MarketingHeader';
import { MarketingTerminalCta } from '@/components/site/MarketingTerminalCta';
import { PublicPageShell } from '@/components/site/PublicPageShell';
import { MARKETING_PEN_CONTRACT_IDS } from '@/data/marketing/penContracts';
import { MarketingPageShell } from '../MarketingPageShell';
import {
  MARKETING_STORY_DESCRIPTION,
  marketingFullscreenParameters,
} from './marketingStoryMeta';

/**
 * Shared marketing shells and chrome.
 * Storybook titles: Marketing/Shells/*
 */
const meta = {
  title: 'Marketing/Shells',
  parameters: {
    ...marketingFullscreenParameters,
    docs: {
      description: {
        component: `${MARKETING_STORY_DESCRIPTION} Shells own header/footer chrome; sections compose inside them.`,
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta;

export default meta;
type Story = StoryObj;

function ShellDemoBlock({
  title,
  body,
}: Readonly<{ title: string; body: string }>) {
  return (
    <div className='rounded-2xl border border-subtle bg-surface-1 p-8'>
      <h2 className='text-xl font-semibold text-primary-token'>{title}</h2>
      <p className='mt-3 text-sm leading-relaxed text-secondary-token'>
        {body}
      </p>
    </div>
  );
}

export const PublicPageShellDefault: Story = {
  name: 'PublicPageShell',
  render: () => (
    <PublicPageShell>
      <MarketingContainer width='page' className='py-16'>
        <ShellDemoBlock
          title='Public Page Shell'
          body='Canonical header, main offset, and footer chrome used by public marketing routes.'
        />
      </MarketingContainer>
    </PublicPageShell>
  ),
};

export const MarketingPageShellDefault: Story = {
  name: 'MarketingPageShell',
  render: () => (
    <MarketingPageShell>
      <MarketingContainer width='page' className='py-16'>
        <ShellDemoBlock
          title='Marketing Page Shell'
          body='Minimal relative/grow wrapper used by artist-lp / homepage compositions when PublicPageShell lives in the layout.'
        />
      </MarketingContainer>
    </MarketingPageShell>
  ),
};

export const MarketingContentShellDefault: Story = {
  name: 'MarketingContentShell',
  render: () => (
    <MarketingPageShell>
      <MarketingContentShell>
        <h1 className='text-3xl font-semibold text-primary-token'>About</h1>
        <p className='mt-4'>
          Content shell applies prose-width container and marketing body
          defaults for long-form pages (about, support, legal-style bodies).
        </p>
      </MarketingContentShell>
    </MarketingPageShell>
  ),
};

export const MarketingContainerPage: Story = {
  name: 'MarketingContainer/page',
  render: () => (
    <div className='bg-base py-12'>
      <MarketingContainer width='page'>
        <ShellDemoBlock
          title='Container Width: page'
          body='Canonical public-content max width (max-w-public-content). Prefer page over deprecated landing alias for new work.'
        />
      </MarketingContainer>
    </div>
  ),
};

export const MarketingContainerLanding: Story = {
  name: 'MarketingContainer/landing',
  render: () => (
    <div className='bg-base py-12'>
      <MarketingContainer width='landing'>
        <ShellDemoBlock
          title='Container Width: landing'
          body='Alias of page width retained for call-site compatibility. Same max-w-public-content token.'
        />
      </MarketingContainer>
    </div>
  ),
};

export const MarketingContainerProse: Story = {
  name: 'MarketingContainer/prose',
  render: () => (
    <div className='bg-base py-12'>
      <MarketingContainer width='prose'>
        <ShellDemoBlock
          title='Container Width: prose'
          body='Canonical prose max width (max-w-prose-canonical / 680px) for long-form reading.'
        />
      </MarketingContainer>
    </div>
  ),
};

export const MarketingHeaderDefault: Story = {
  name: 'MarketingHeader',
  render: () => (
    <div className='bg-base min-h-40'>
      <MarketingHeader variant='landing' />
    </div>
  ),
};

export const MarketingFooterDefault: Story = {
  name: 'MarketingFooter',
  render: () => (
    <div className='bg-base'>
      <MarketingFooter variant='expanded' showCta={false} />
    </div>
  ),
};

export const MarketingFooterCtaDefault: Story = {
  name: 'MarketingFooterCta',
  render: () => (
    <div className='bg-base'>
      <MarketingFooterCta
        title='Request Access to Jovie.'
        body='Join the private launch list for the release platform built for independent artists.'
      />
    </div>
  ),
};

export const MarketingFinalCtaDefault: Story = {
  name: 'MarketingFinalCTA',
  render: () => (
    <div className='bg-base'>
      <MarketingFinalCTA
        title='Request private launch access.'
        body='One adaptive profile for every drop.'
      />
    </div>
  ),
};

export const MarketingTerminalCtaDefault: Story = {
  name: 'MarketingTerminalCta',
  render: () => (
    <div className='bg-base'>
      <MarketingTerminalCta
        title='A shared terminal call to action.'
        ctaLabel='Request Access'
        ctaHref='/signup'
        testId='storybook-marketing-terminal-cta'
        penContractId={MARKETING_PEN_CONTRACT_IDS.shell.finalCta}
      />
    </div>
  ),
};
