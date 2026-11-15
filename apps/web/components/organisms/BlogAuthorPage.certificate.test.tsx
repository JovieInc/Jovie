import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { BlogAuthorPage } from './BlogAuthorPage';

const hero = <h1>Tim White</h1>;

function cards(count: number) {
  return Array.from({ length: count }, (_, index) => (
    <article key={`post-${index + 1}`} aria-label={`Post ${index + 1}`}>
      <h3>Post {index + 1}</h3>
    </article>
  ));
}

describe('BlogAuthorPage certificate', () => {
  it('renders one article with singular grammar axe-clean', async () => {
    const { container } = render(
      <BlogAuthorPage
        articleCount={1}
        authorHero={hero}
        articleCards={cards(1)}
      />
    );

    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
      '1 article'
    );
    expect(screen.getAllByRole('article')).toHaveLength(1);
    await expectNoA11yViolations(container);
  });

  it('renders a long list of articles axe-clean', async () => {
    const { container } = render(
      <BlogAuthorPage
        articleCount={12}
        authorHero={hero}
        articleCards={cards(12)}
      />
    );

    expect(
      screen.getByRole('heading', { level: 2, name: '12 articles' })
    ).toBeVisible();
    expect(screen.getAllByRole('article')).toHaveLength(12);
    await expectNoA11yViolations(container);
  });

  it('stays axe-clean inside a right-to-left document', async () => {
    const { container } = render(
      <div dir='rtl'>
        <BlogAuthorPage
          articleCount={2}
          authorHero={hero}
          articleCards={cards(2)}
        />
      </div>
    );

    expect(
      screen.getByRole('heading', { level: 2, name: '2 articles' })
    ).toBeVisible();
    await expectNoA11yViolations(container);
  });
});
