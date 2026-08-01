import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { STORY_BLOG_POSTS } from './fixtures';
import { StoryBlogCard } from './StoryBlogCard';

const post = STORY_BLOG_POSTS[0]!;

describe('StoryBlogCard', () => {
  it('renders title, excerpt, and author for the default variant', () => {
    render(<StoryBlogCard post={post} />);

    expect(
      screen.getByRole('heading', { name: post.title })
    ).toBeInTheDocument();
    expect(screen.getByText(post.excerpt)).toBeInTheDocument();
    expect(screen.getByText(post.author)).toBeInTheDocument();
    expect(screen.getByText(post.category)).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: new RegExp(post.title) })
    ).toHaveAttribute('href', `/blog/${post.slug}`);
  });

  it('renders featured variant without losing card content', () => {
    const { container } = render(
      <StoryBlogCard post={post} variant='featured' />
    );

    expect(
      screen.getByRole('heading', { name: post.title })
    ).toBeInTheDocument();
    // featured uses larger padding / radius classes
    expect(container.querySelector('article')?.className).toMatch(/p-8/);
  });
});
