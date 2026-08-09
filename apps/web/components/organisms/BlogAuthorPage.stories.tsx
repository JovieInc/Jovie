import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { BlogAuthorCard } from '@/app/(marketing)/blog/components/BlogAuthorCard';
import { BlogCard } from '@/app/(marketing)/blog/components/BlogCard';
import type { BlogPostSummary } from '@/lib/blog/getBlogPosts';
import type { ResolvedAuthor } from '@/lib/blog/resolveAuthor';
import { TIM_WHITE_PROFILE } from '@/lib/tim-white';
import { BlogAuthorPage } from './BlogAuthorPage';

const WEB_023_AUTHOR = {
  name: TIM_WHITE_PROFILE.name,
  title: 'Founder at Jovie',
  avatarUrl: TIM_WHITE_PROFILE.avatarSrc,
  profileUrl: TIM_WHITE_PROFILE.publicProfilePath,
  isVerified: false,
  username: TIM_WHITE_PROFILE.publicProfileHandle,
} as const satisfies ResolvedAuthor;

const WEB_023_POSTS = [
  {
    slug: 'the-suno-playbook-teardown',
    title: 'The $100K Suno Playbook Is Missing the Hard Part',
    date: '2026-07-04',
    author: TIM_WHITE_PROFILE.name,
    authorUsername: TIM_WHITE_PROFILE.publicProfileHandle,
    authorTitle: 'Founder at Jovie',
    category: 'Music Business',
    tags: [
      'suno',
      'AI music',
      'catalog spam',
      'distribution',
      'activation',
      'release strategy',
      'automation',
      'revenue',
    ],
    excerpt:
      "A viral post has been making the rounds. The pitch: a 7-step automated music business that earns $100K/year using Claude, Suno, and Spotify. It's been shared tens of thousands of times. People are exc",
    readingTime: 6,
    wordCount: 1312,
  },
  {
    slug: 'the-contact-problem',
    title: 'The Contact Problem',
    date: '2026-03-18',
    author: TIM_WHITE_PROFILE.name,
    authorUsername: TIM_WHITE_PROFILE.publicProfileHandle,
    authorTitle: 'Founder at Jovie',
    category: 'Artist Management',
    tags: [
      'contact info',
      'manager changes',
      'booking agents',
      'music industry',
    ],
    excerpt:
      "When I fired my manager, the first thing I realized wasn't emotional. It was logistical.",
    readingTime: 5,
    wordCount: 978,
  },
  {
    slug: 'the-myspace-problem',
    title: 'The MySpace Problem',
    date: '2025-02-03',
    author: TIM_WHITE_PROFILE.name,
    authorUsername: TIM_WHITE_PROFILE.publicProfileHandle,
    authorTitle: 'Founder at Jovie',
    category: 'Inbound Marketing',
    tags: [
      'MySpace',
      'Facebook',
      'platform design',
      'simplicity',
      'artist pages',
    ],
    excerpt: 'When I was a teenager, everyone had a MySpace.',
    readingTime: 5,
    wordCount: 1098,
  },
  {
    slug: 'the-friday-problem',
    title: 'The Friday Problem',
    date: '2025-01-15',
    author: TIM_WHITE_PROFILE.name,
    authorUsername: TIM_WHITE_PROFILE.publicProfileHandle,
    authorTitle: 'Founder at Jovie',
    category: 'Release Strategy',
    tags: ['release strategy', 'momentum', 'content calendar', 'marketing'],
    excerpt: 'Most artists make the same mistake.',
    readingTime: 4,
    wordCount: 922,
  },
] as const satisfies readonly BlogPostSummary[];

/** Merge commit that introduced the shared route/story body in PR #15711. */
export const BLOG_AUTHOR_STORY_RECEIPT = {
  registryId: 'web-023-blog--authors--[username]',
  route: '/blog/authors/[username]',
  sourcePath: 'apps/web/app/(marketing)/blog/authors/[username]/page.tsx',
  bodyPath: 'apps/web/components/organisms/BlogAuthorPage.tsx',
  sourceExport: 'BlogAuthorPage',
  storyExport: 'Web023BlogAuthor',
  sourceSha: '468cc374b544d64573403e5fa8e047303964e877',
} as const;

const meta = {
  title: 'Public Catalog/BlogAuthorPage',
  component: BlogAuthorPage,
  parameters: {
    layout: 'fullscreen',
    controls: { disable: true },
    pen: BLOG_AUTHOR_STORY_RECEIPT,
    docs: {
      description: {
        component:
          'Deterministic production-body fixture for /blog/authors/[username]. The route still owns params, post/profile loading, metadata, schemas, and notFound; this story uses the canonical Tim White identity and the four checked-in blog posts.',
      },
    },
  },
} satisfies Meta<typeof BlogAuthorPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Web023BlogAuthor: Story = {
  name: 'web-023-blog--authors--[username] / Tim White',
  args: {
    articleCount: WEB_023_POSTS.length,
    authorHero: <BlogAuthorCard author={WEB_023_AUTHOR} variant='hero' />,
    articleCards: WEB_023_POSTS.map(post => (
      <BlogCard key={post.slug} post={post} author={WEB_023_AUTHOR} />
    )),
  },
  render: args => <BlogAuthorPage {...args} />,
};
