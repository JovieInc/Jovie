import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { STORY_BLOG_POSTS } from './fixtures';
import { StoryBlogCard } from './StoryBlogCard';

const post = STORY_BLOG_POSTS[0]!;

describe('StoryBlogCard', () => {
  it('renders production title and category navigation for the default variant', () => {
    render(<StoryBlogCard post={post} />);

    const heading = screen.getByRole('heading', { name: post.title });
    expect(heading).toBeInTheDocument();
    expect(heading).not.toHaveClass('line-clamp-2');

    expect(screen.getByText(`By ${post.author}`)).toBeInTheDocument();
    expect(screen.getByText(post.category)).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: new RegExp(post.title) })
    ).toHaveAttribute('href', `/blog/${post.slug}`);
  });

  it('renders featured variant without losing card content', () => {
    const { container } = render(
      <StoryBlogCard post={post} variant='featured' />
    );

    const heading = screen.getByRole('heading', { name: post.title });
    expect(heading).toBeInTheDocument();
    expect(heading).not.toHaveClass('line-clamp-2');
    // The fixture renders the actual production variant.
    expect(container.querySelector('article')).toHaveAttribute(
      'data-variant',
      'featured'
    );
  });
});
