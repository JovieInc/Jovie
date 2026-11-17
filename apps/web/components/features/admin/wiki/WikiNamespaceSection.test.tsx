import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { WikiNamespaceSection } from './WikiNamespaceSection';

describe('WikiNamespaceSection', () => {
  it('lists each page as a link to its wiki route', async () => {
    const { container } = render(
      <WikiNamespaceSection
        group={{
          namespace: 'ops',
          pages: [
            { slug: 'ops/runbook', title: 'Runbook' },
            { slug: 'ops/on-call', title: '' },
          ],
        }}
      />
    );

    expect(
      screen.getByRole('heading', { level: 2, name: 'ops' })
    ).toBeVisible();
    expect(screen.getByRole('link', { name: 'Runbook' })).toHaveAttribute(
      'href',
      '/hud/wiki/ops%2Frunbook'
    );
    // A page without a title falls back to one built from its slug.
    expect(screen.getByRole('link', { name: 'On Call' })).toHaveAttribute(
      'href',
      '/hud/wiki/ops%2Fon-call'
    );
    await expectNoA11yViolations(container);
  });

  it('moves keyboard focus through the page links in order', async () => {
    const user = userEvent.setup();
    render(
      <WikiNamespaceSection
        group={{
          namespace: 'ops',
          pages: [
            { slug: 'ops/runbook', title: 'Runbook' },
            { slug: 'ops/deploys', title: 'Deploys' },
          ],
        }}
      />
    );

    await user.tab();
    expect(screen.getByRole('link', { name: 'Runbook' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('link', { name: 'Deploys' })).toHaveFocus();
  });

  it('renders an empty list for a namespace with no pages', async () => {
    const { container } = render(
      <WikiNamespaceSection group={{ namespace: 'drafts', pages: [] }} />
    );

    expect(
      within(screen.getByRole('list')).queryAllByRole('listitem')
    ).toHaveLength(0);
    expect(screen.queryByRole('link')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('stays axe-clean with long and right-to-left titles', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <WikiNamespaceSection
          group={{
            namespace: 'العمليات',
            pages: [
              {
                slug: 'العمليات/دليل',
                title:
                  'دليل التشغيل للفريق المناوب عند فشل النشر في بيئة الإنتاج',
              },
            ],
          }}
        />
      </div>
    );

    expect(
      screen.getByRole('link', {
        name: 'دليل التشغيل للفريق المناوب عند فشل النشر في بيئة الإنتاج',
      })
    ).toBeVisible();
    await expectNoA11yViolations(container);
  });
});
