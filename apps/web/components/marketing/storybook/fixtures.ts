/**
 * Stable Storybook fixtures for marketing catalog stories (JOV-4420).
 * Prefer shipped copy/data; never invent proof metrics or fake logos.
 *
 * Blog fixtures intentionally avoid `@/lib/blog/getBlogPosts` and the route
 * BlogCard — those pull node:fs / filesystem-paths into the Storybook browser
 * bundle. StoryBlogCard (fixtures-ui.tsx) mirrors product card grammar without Node deps.
 */

export const STORY_FAQ_ITEMS = [
  {
    question: 'What is Jovie?',
    answer:
      'Jovie is a release platform for independent musicians. It combines smart links, artist profiles, audience intelligence, release automation, and AI tools.',
  },
  {
    question: 'Is Jovie free?',
    answer:
      'Yes. Jovie offers a free tier that lets you create a profile, add releases, and start collecting fans. Paid plans unlock advanced analytics and release tools.',
  },
  {
    question: 'Who is Jovie for?',
    answer:
      'Independent musicians and their teams who want one adaptive profile that captures fans and reactivates them automatically.',
  },
] as const;

/** Fixture-safe blog card data — no network, filesystem, or fabricated metrics. */
export interface StoryBlogPost {
  readonly slug: string;
  readonly title: string;
  readonly date: string;
  readonly author: string;
  readonly category: string;
  readonly excerpt: string;
  readonly readingTime: number;
}

export const STORY_BLOG_POSTS: readonly StoryBlogPost[] = [
  {
    slug: 'storybook-fixture-release-playbook',
    title: 'A Release Playbook That Fits One Profile',
    date: '2026-01-15',
    author: 'Jovie',
    category: 'Playbooks',
    excerpt:
      'How independent artists keep pre-save, release day, and post-drop reactivation in one place.',
    readingTime: 4,
  },
  {
    slug: 'storybook-fixture-fan-capture',
    title: 'Capture Every Fan Without Another Tool',
    date: '2026-01-10',
    author: 'Jovie',
    category: 'Product',
    excerpt:
      'Turn profile traffic into a contact you can notify — without bolting on a separate form stack.',
    readingTime: 3,
  },
  {
    slug: 'storybook-fixture-smart-links',
    title: 'Smart Links That Prefer The Right Destination',
    date: '2026-01-05',
    author: 'Jovie',
    category: 'Product',
    excerpt:
      'Route listeners to the store or streamer they already use, then keep them on your profile.',
    readingTime: 3,
  },
] as const;

export const STORY_PROSE_PARAGRAPHS = [
  'Jovie is a release platform for independent musicians. One adaptive profile captures fans, routes them to the right listen path, and reactivates them when you drop again.',
  'This Storybook prose block stands in for long-form SEO/editorial body content. Production blog bodies still render through the blog route; the registry marks that path as extract-pending.',
  'Marketing pages remain fully static (revalidate = false) and dark-only (System A).',
] as const;

/**
 * Registry component paths that are TBD / legacy and cannot render as
 * first-class product compositions yet. Stories for these section ids are
 * tagged `wip` and listed in the catalog gap table.
 */
export const MARKETING_SECTION_STORY_GAPS = [
  {
    sectionId: 'comparison',
    component:
      'content/comparisons/ComparisonData (data-driven; page-local table render)',
    storyStrategy: 'Compose MarketingHero + feature matrix from linktree data',
  },
  {
    sectionId: 'ownership',
    component: 'TBD — first implementer creates ArtistProfileOwnershipSection',
    storyStrategy: 'WIP placeholder with registry neverUse + requiredInputs',
  },
  {
    sectionId: 'content-prose',
    component:
      'apps/web/app/(marketing)/blog/[slug]/BlogPostPage (extract pending)',
    storyStrategy: 'MarketingContentShell prose fixture (not full blog page)',
  },
  {
    sectionId: 'cta',
    component:
      'components/marketing/MarketingFooterCta (actual: components/site/MarketingFooterCta)',
    storyStrategy: 'Render site MarketingFooterCta (registry path drift)',
  },
  {
    sectionId: 'stats',
    component: 'components/marketing/HomeStatQuoteSection (legacy path drift)',
    storyStrategy: 'Render features/home HomeStatQuoteSection',
  },
] as const;
