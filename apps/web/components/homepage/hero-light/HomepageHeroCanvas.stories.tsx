import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, within } from 'storybook/test';
import { PublicPageShell } from '@/components/site/PublicPageShell';
import { HOMEPAGE_COPY } from '@/data/homepageCopy';
import { HomepageHeroCanvas } from './HomepageHeroCanvas';

const hero = HOMEPAGE_COPY.hero;

const meta = {
  title: 'Marketing/HomepageHeroCanvas',
  component: HomepageHeroCanvas,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Shipped homepage hero. The CSS poster is the layout. WebGL crossfades in when the device can run it, and context loss leaves the poster in place.',
      },
    },
  },
  args: {
    headingId: 'home-hero-heading',
    headline: hero.headline,
    subhead: hero.subhead,
    claim: hero.claim,
    supportNote: hero.supportNote,
    profile: hero.profile,
    sectionOwner: 'apps/web/components/homepage/HomepageArtistProfile.tsx',
  },
  decorators: [
    Story => (
      <div className='dark min-h-svh bg-base text-primary-token'>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof HomepageHeroCanvas>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Canvas: Story = {};

export const WithCanonicalHeader: Story = {
  parameters: {
    nextjs: { appDirectory: true, navigation: { pathname: '/' } },
  },
  render: args => (
    <PublicPageShell
      className='home-viewport home-viewport--hero-canvas min-h-svh overflow-x-clip bg-base text-primary-token'
      footerVariant='expanded'
      logoSize='sm'
    >
      {/* Storybook vitest runner determinism: scroll(root) resolves against
          the already-scrolled embedded preview scroller, so the scroll-linked
          hero fade starts at progress 1 and the copy renders opacity 0 before
          the play assertions run. Pin the resting state (scroll 0) for the
          catalog; the scroll fade itself is covered by
          tests/e2e/homepage-hero-canvas-scroll.spec.ts. */}
      <style>
        {
          '[data-homepage-hero-canvas-story] .homepage-hero-canvas__copy { opacity: 1 !important; }'
        }
      </style>
      <div data-homepage-hero-canvas-story='true'>
        <HomepageHeroCanvas {...args} />
      </div>
    </PublicPageShell>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('header-nav')).toBeVisible();
    await expect(
      canvas.getByRole('heading', { level: 1, name: hero.headline })
    ).toBeVisible();
    await expect(canvas.getAllByTestId('homepage-claim-form')).toHaveLength(1);
    await expect(canvas.getByTestId('homepage-primary-cta')).toBeVisible();
    await expect(canvas.getByTestId('homepage-claim-form')).toHaveAttribute(
      'action',
      '/start'
    );
  },
};
