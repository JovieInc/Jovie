import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { WikiPageArticle } from './WikiPageArticle';

const LONG_PARAGRAPH =
  'Restart the lane worker, then verify the queue drains. If the queue does not drain within ten minutes, check the lane gate, the deploy receipt and the worker logs in that order.';

describe('WikiPageArticle certificate states', () => {
  it('renders compiled markdown as headings, paragraphs and links', async () => {
    const { container } = render(
      await WikiPageArticle({
        page: {
          slug: 'ops/runbook',
          title: 'Runbook',
          compiled_truth:
            '# Runbook\n\nRestart the lane worker.\n\n## Verify\n\nSee [the gate](https://example.com/gate).',
        },
      })
    );
    expect(
      screen.getByRole('heading', { level: 1, name: 'Runbook' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Verify' })
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'the gate' })).toHaveAttribute(
      'href',
      'https://example.com/gate'
    );
    expect(screen.queryByText('This wiki page has no content.')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('says the page has no content for a missing or empty document', async () => {
    for (const compiled_truth of [undefined, '']) {
      const { container, unmount } = render(
        await WikiPageArticle({
          page: { slug: 'ops/empty', title: 'Empty', compiled_truth },
        })
      );
      expect(container.querySelector('article')).toHaveTextContent(
        /^This wiki page has no content\.$/
      );
      await expectNoA11yViolations(container);
      unmount();
    }
  });

  it('renders every section of a long document', async () => {
    const sections = Array.from(
      { length: 6 },
      (_, index) => `## Step ${index + 1}\n\n${LONG_PARAGRAPH}`
    );
    const { container } = render(
      await WikiPageArticle({
        page: {
          slug: 'ops/long',
          title: 'Long',
          compiled_truth: ['# Long runbook', ...sections].join('\n\n'),
        },
      })
    );
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(6);
    expect(screen.getAllByText(LONG_PARAGRAPH)).toHaveLength(6);
    await expectNoA11yViolations(container);
  });

  it('stays axe clean inside a right-to-left document', async () => {
    const article = await WikiPageArticle({
      page: {
        slug: 'ops/runbook-ar',
        title: 'دليل التشغيل',
        compiled_truth: '# دليل التشغيل\n\nأعد تشغيل العامل.',
      },
    });
    const { container } = render(<div dir='rtl'>{article}</div>);
    expect(
      screen.getByRole('heading', { name: 'دليل التشغيل' })
    ).toBeInTheDocument();
    expect(screen.getByText('أعد تشغيل العامل.')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
