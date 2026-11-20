import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { STORY_BLOG_POSTS } from './fixtures';
import { StoryBlogCard } from './StoryBlogCard';

const POST = STORY_BLOG_POSTS[0];

describe('StoryBlogCard certificate', () => {
  it.each(['default', 'featured'] as const)(
    'renders the %s card axe-clean',
    async variant => {
      const { container } = render(
        <StoryBlogCard post={POST} variant={variant} />
      );

      expect(
        screen.getByRole('heading', { name: POST.title })
      ).toBeInTheDocument();
      expect(
        screen.getByRole('link', { name: new RegExp(POST.title) })
      ).toHaveAttribute('href', `/blog/${POST.slug}`);
      await expectNoA11yViolations(container);
    }
  );

  it('keeps a long title whole and stays axe-clean', async () => {
    const title =
      'A much longer editorial title that must remain complete and readable across several lines without truncating';
    const { container } = render(
      <StoryBlogCard post={{ ...POST, slug: 'long-title', title }} />
    );

    const heading = screen.getByRole('heading', { name: title });
    expect(heading).not.toHaveClass('line-clamp-2');
    await expectNoA11yViolations(container);
  });

  it('renders an Arabic card right to left', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <StoryBlogCard
          post={{ ...POST, title: 'مشكلة جهات الاتصال', author: 'تيم وايت' }}
        />
      </div>
    );

    expect(
      screen.getByRole('heading', { name: 'مشكلة جهات الاتصال' })
    ).toBeInTheDocument();
    expect(screen.getByText('By تيم وايت')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
