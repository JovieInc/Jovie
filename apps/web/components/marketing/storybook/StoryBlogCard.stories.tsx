import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect } from 'storybook/test';
import { STORY_BLOG_POSTS } from './fixtures';
import {
  MARKETING_STORY_DESCRIPTION,
  marketingCenteredParameters,
} from './marketingStoryMeta';
import { StoryBlogCard } from './StoryBlogCard';

/**
 * Production blog card with browser-safe deterministic data.
 * Used by Marketing/Recipes/blog-landing and Marketing/Sections compositions.
 */
const meta = {
  title: 'Marketing/Fixtures/StoryBlogCard',
  component: StoryBlogCard,
  parameters: {
    ...marketingCenteredParameters,
    docs: {
      description: {
        component: `${MARKETING_STORY_DESCRIPTION} Production BlogCard rendered with browser-safe deterministic data.`,
      },
    },
  },
  tags: ['autodocs'],
  args: {
    post: STORY_BLOG_POSTS[0],
    variant: 'default',
  },
} satisfies Meta<typeof StoryBlogCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  name: 'default',
  render: args => (
    <div className='mx-auto max-w-md p-8'>
      <StoryBlogCard {...args} />
    </div>
  ),
};

export const Featured: Story = {
  name: 'featured',
  args: {
    post: STORY_BLOG_POSTS[0],
    variant: 'featured',
  },
  render: args => (
    <div className='mx-auto max-w-3xl p-8'>
      <StoryBlogCard {...args} />
    </div>
  ),
};

/** Published frontmatter plus the canonical O64tu media variants. */
export const CanonicalEditorial: Story = {
  render: () => (
    <div className='grid grid-cols-1 gap-12 p-6 md:grid-cols-3'>
      {[
        {
          slug: 'the-suno-playbook-teardown',
          title: 'The $100K Suno Playbook Is Missing the Hard Part',
          date: '2026-07-04',
          category: 'Music Business',
        },
        {
          slug: 'the-contact-problem',
          title: 'The Contact Problem',
          date: '2026-03-18',
          category: 'Artist Management',
        },
        {
          slug: 'the-myspace-problem',
          title: 'The MySpace Problem',
          date: '2025-02-03',
          category: 'Inbound Marketing',
        },
      ].map(post => (
        <StoryBlogCard
          key={post.slug}
          post={{ ...post, author: 'Tim White', excerpt: '', readingTime: 0 }}
        />
      ))}
    </div>
  ),
};

/** Exercise real browser geometry with independently sized visual rows. */
export const TitleAlignment: Story = {
  render: () => (
    <div data-testid='title-grid' className='grid gap-6 p-6'>
      {[
        'A short title',
        'A title that needs a second line in this card',
        'A much longer editorial title that must remain complete and readable across several lines without truncating the article name',
        'Another short title',
        'A brief update',
        'More news',
      ].map((title, index) => (
        <StoryBlogCard
          key={title}
          post={{ ...STORY_BLOG_POSTS[0], slug: `alignment-${index}`, title }}
        />
      ))}
    </div>
  ),
  play: async ({ canvasElement }) => {
    await document.fonts.ready;
    const grid = canvasElement.querySelector<HTMLElement>(
      '[data-testid="title-grid"]'
    );
    if (!grid) throw new Error('Title grid missing');
    const cards = Array.from(grid.querySelectorAll('article'));
    for (const [width, columns] of [
      [960, 3],
      [660, 2],
      [350, 1],
    ]) {
      grid.style.width = `${width}px`;
      grid.style.gridTemplateColumns = `repeat(${columns}, minmax(0, 1fr))`;
      await new Promise<void>(resolve =>
        requestAnimationFrame(() => resolve())
      );
      expect(grid.scrollWidth).toBeLessThanOrEqual(width);
      const positions = cards.map(card => {
        const title = card.querySelector('h2');
        const metadata = card.querySelector('time')?.parentElement;
        if (!title || !metadata) throw new Error('Card content missing');
        expect(title.scrollHeight).toBeLessThanOrEqual(title.clientHeight);
        expect(getComputedStyle(title).webkitLineClamp).toBe('none');
        expect(title.getBoundingClientRect().height).toBeGreaterThan(0);
        return {
          title: title.getBoundingClientRect().top,
          metadata: metadata.getBoundingClientRect().top,
        };
      });
      for (let start = 0; start < positions.length; start += columns) {
        const row = positions.slice(start, start + columns);
        expect(
          Math.max(...row.map(p => p.title)) -
            Math.min(...row.map(p => p.title))
        ).toBeLessThan(1);
        expect(
          Math.max(...row.map(p => p.metadata)) -
            Math.min(...row.map(p => p.metadata))
        ).toBeLessThan(1);
      }
      if (columns === 3) {
        // A later short-title row must not inherit the long first row's space.
        expect(positions[3].metadata - positions[3].title).toBeLessThan(
          positions[0].metadata - positions[0].title
        );
      }
    }
    grid.style.width = '';
    grid.style.gridTemplateColumns = 'repeat(3, minmax(0, 1fr))';
  },
};
