import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { EngineeringStoryRecord } from '@/lib/engineering-publication';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { EngineeringArticle, EngineeringIndex } from './EngineeringPublication';
import {
  LongContentStory,
  PartialSourcelessRecord,
  RtlArabic,
} from './EngineeringPublication.states.stories';

const EVIDENCE_RECORD: EngineeringStoryRecord = {
  slug: 'verified-changelog',
  body: 'Shipped copy.',
  source: {
    id: 'verified-changelog',
    title: 'Public shipping record',
    date: '2026-08-30',
    summary: 'Artists can read the public What is New page.',
    status: 'draft',
    availability: 'public',
    capabilities: [
      { id: 'changelog', availability: 'public', receiptId: 'changelog-live' },
    ],
    evidence: [
      {
        id: 'changelog-live',
        kind: 'changelog',
        href: 'https://jov.ie/changelog',
        claims: [],
      },
      {
        id: 'pr-live',
        kind: 'pull-request',
        href: 'https://github.com/JovieInc/Jovie/pull/1',
        claims: [],
      },
      {
        id: 'url-live',
        kind: 'public-url',
        href: 'https://jov.ie/new',
        claims: [],
      },
    ],
    founderApproval: null,
  },
  issues: [],
};

describe('EngineeringPublication certificate', () => {
  it('labels evidence kinds in sentence case, without forced capitals', async () => {
    const { container } = render(
      <EngineeringArticle
        record={EVIDENCE_RECORD}
        html='<p>Shipped copy.</p>'
        preview
      />
    );

    for (const label of ['Changelog', 'Pull request', 'Public URL']) {
      const kind = screen.getByText(label);
      expect(kind.className).not.toMatch(/\buppercase\b/);
    }
    expect(screen.queryByText('pull-request')).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('moves keyboard focus from the back link to the evidence links', async () => {
    const user = userEvent.setup();
    render(
      <EngineeringArticle
        record={EVIDENCE_RECORD}
        html='<p>Shipped copy.</p>'
        preview
      />
    );

    await user.tab();
    expect(screen.getByRole('link', { name: 'Founder preview' })).toHaveFocus();
    expect(
      screen.getByRole('link', { name: 'Founder preview' })
    ).toHaveAttribute('href', '/engineering/preview');
    await user.tab();
    expect(
      screen.getByRole('link', { name: 'https://jov.ie/changelog' })
    ).toHaveFocus();
  });

  it('falls back to the slug and blocked copy for a record with no source', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <EngineeringIndex
        stories={PartialSourcelessRecord.args?.stories ?? []}
        preview
      />
    );

    expect(screen.getByText('Blocked')).toBeVisible();
    expect(screen.queryByText('Public')).not.toBeInTheDocument();
    expect(
      screen.getByText(
        'This source is blocked until the publication gates pass.'
      )
    ).toBeVisible();
    const link = screen.getByRole('link', { name: 'unparsed-source' });
    await user.tab();
    expect(link).toHaveFocus();
    expect(link).toHaveAttribute(
      'href',
      '/engineering/preview/unparsed-source'
    );
    await expectNoA11yViolations(container);
  });

  it('clamps a long title and keeps the long summary whole', async () => {
    const stories = LongContentStory.args?.stories ?? [];
    const { container } = render(<EngineeringIndex stories={stories} />);

    const title = stories[0]?.source?.title ?? '';
    const heading = screen.getByRole('heading', { level: 2, name: title });
    expect(heading).toHaveClass('line-clamp-2');
    expect(screen.getByText(stories[0]?.source?.summary ?? '')).toBeVisible();
    await expectNoA11yViolations(container);
  });

  it('renders an Arabic story in a right-to-left document', async () => {
    const stories = RtlArabic.args?.stories ?? [];
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <EngineeringIndex stories={stories} />
      </div>
    );

    expect(
      screen.getByRole('link', { name: 'سجل الإصدارات العام' })
    ).toHaveAttribute('href', '/engineering/arabic-shipping-record');
    expect(screen.getByText('Published')).toBeVisible();
    await expectNoA11yViolations(container);
  });

  it('shows the empty public index axe-clean', async () => {
    const { container } = render(<EngineeringIndex stories={[]} />);
    expect(
      screen.getByText(
        'No founder-approved engineering stories are public yet.'
      )
    ).toBeVisible();
    await expectNoA11yViolations(container);
  });
});
