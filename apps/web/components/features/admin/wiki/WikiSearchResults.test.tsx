import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { WikiSearchResults } from './WikiSearchResults';

describe('WikiSearchResults', () => {
  it('shows the result count, links and excerpts', async () => {
    const { container } = render(
      <WikiSearchResults
        query='deploy'
        results={[
          {
            slug: 'ops/deploys',
            title: 'Deploy checklist',
            chunk_text: 'Run the canary first.',
          },
          { slug: 'ops/rollback', title: 'Rollback' },
        ]}
      />
    );

    expect(screen.getByText('2 results for "deploy"')).toBeVisible();
    expect(
      screen.getByRole('link', { name: 'Deploy checklist' })
    ).toHaveAttribute('href', '/hud/wiki/ops%2Fdeploys');
    expect(screen.getByText('Run the canary first.')).toBeVisible();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    await expectNoA11yViolations(container);
  });

  it('uses the singular for one result and lets the keyboard reach it', async () => {
    const user = userEvent.setup();
    render(
      <WikiSearchResults
        query='rollback'
        results={[{ slug: 'ops/rollback', title: 'Rollback' }]}
      />
    );

    expect(screen.getByText('1 result for "rollback"')).toBeVisible();
    await user.tab();
    expect(screen.getByRole('link', { name: 'Rollback' })).toHaveFocus();
  });

  it('renders a zero count and no list items when nothing matched', async () => {
    const { container } = render(
      <WikiSearchResults query='nothing' results={[]} />
    );

    expect(screen.getByText('0 results for "nothing"')).toBeVisible();
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
    await expectNoA11yViolations(container);
  });

  it('falls back to the slug title and skips an empty excerpt', async () => {
    const { container } = render(
      <WikiSearchResults
        query='runbook'
        results={[{ slug: 'ops/on-call-runbook', title: '', chunk_text: '' }]}
      />
    );

    expect(screen.getByRole('link', { name: 'On Call Runbook' })).toBeVisible();
    expect(screen.getByRole('listitem').querySelector('p')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('stays axe-clean with right-to-left results', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <WikiSearchResults
          query='النشر'
          results={[
            {
              slug: 'العمليات/النشر',
              title: 'قائمة التحقق من النشر',
              chunk_text: 'شغّل الإصدار التجريبي أولاً.',
            },
          ]}
        />
      </div>
    );

    expect(
      screen.getByRole('link', { name: 'قائمة التحقق من النشر' })
    ).toBeVisible();
    await expectNoA11yViolations(container);
  });
});
