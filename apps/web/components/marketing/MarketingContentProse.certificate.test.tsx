import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { MarketingContentProse } from './MarketingContentProse';

describe('MarketingContentProse certificate', () => {
  it('labels the article region and renders its HTML axe-clean', async () => {
    const { container } = render(
      <MarketingContentProse
        ariaLabel='Founder letter'
        className='mx-auto'
        html='<h2 id="why">Why</h2><p>Because.</p><ul><li>One</li></ul><p><a href="/blog">Read more</a></p>'
      />
    );

    const region = screen.getByRole('region', { name: 'Founder letter' });
    expect(region).toHaveClass('max-w-prose-canonical', 'mx-auto');
    expect(
      screen.getByRole('heading', { level: 2, name: 'Why' })
    ).toBeVisible();
    expect(screen.getByRole('listitem')).toHaveTextContent('One');
    expect(screen.getByRole('link', { name: 'Read more' })).toHaveAttribute(
      'href',
      '/blog'
    );
    await expectNoA11yViolations(container);
  });

  it('defaults the label for a single paragraph and keeps RTL axe-clean', async () => {
    const { container, unmount } = render(
      <MarketingContentProse html='<p>Ship something every Friday.</p>' />
    );
    expect(
      screen.getByRole('region', { name: 'Article content' })
    ).toHaveTextContent('Ship something every Friday.');
    await expectNoA11yViolations(container);
    unmount();

    const rtl = render(
      <div dir='rtl' lang='ar'>
        <MarketingContentProse
          ariaLabel='محتوى المقال'
          html='<p>أصدر شيئًا كل جمعة.</p>'
        />
      </div>
    );
    expect(screen.getByRole('region', { name: 'محتوى المقال' })).toBeVisible();
    await expectNoA11yViolations(rtl.container);
  });
});
