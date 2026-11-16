import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  type CustomerChangelogEntry,
  groupCustomerChangelogByDay,
} from '@/lib/customer-changelog';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ChangelogDayRow } from './ChangelogDayRow';

const copy = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/useClipboard', () => ({
  useClipboard: () => ({ copy, isSuccess: false }),
}));

const LEAD: CustomerChangelogEntry = {
  id: 'customer-update:release-previews',
  aliases: [],
  title: 'Play release previews right on a profile',
  slug: 'play-release-previews',
  date: '2026-11-03',
  summary: 'Fans can hear a release without leaving the page.',
  category: 'new',
  capabilities: [],
  surfaces: [],
  availability: 'ga',
  media: null,
  technicalVersion: '2026-11-03',
  explanation: 'Fans can hear a release without leaving the page.',
  supporting: ['Previews start from the release card.'],
  action: { label: 'See a demo profile', href: '/demo' },
  technical: [],
  prominence: 'featured',
};

const FIX: CustomerChangelogEntry = {
  ...LEAD,
  id: 'customer-update:fix-1',
  slug: 'fix-1',
  title: 'Send stays visible with larger text',
  explanation: 'The composer keeps its actions in view.',
  supporting: [],
  action: null,
  category: 'fixed',
  prominence: 'small',
};

describe('ChangelogDayRow certificate', () => {
  it('copies the permalink of the post whose control is pressed', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <ChangelogDayRow day={groupCustomerChangelogByDay([LEAD, FIX])[0]} />
    );

    await user.click(
      screen.getByRole('button', { name: `Copy Link To “${LEAD.title}”` })
    );
    expect(copy).toHaveBeenCalledWith(
      `${window.location.origin}/changelog#play-release-previews`
    );
    expect(
      screen.getByRole('link', { name: /See a demo profile/ })
    ).toHaveAttribute('href', '/demo');
    expect(
      within(
        screen.getByRole('list', { name: 'Fixes and polish' })
      ).getAllByRole('listitem')
    ).toHaveLength(1);
    await expectNoA11yViolations(container);
  });

  it('renders an empty day with no date link and no posts', async () => {
    const { container } = render(
      <ChangelogDayRow day={{ date: '2026-11-03', posts: [], polish: [] }} />
    );

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('renders a headline-only post without a lead or bullets', async () => {
    const { container } = render(
      <ChangelogDayRow
        day={
          groupCustomerChangelogByDay([
            { ...LEAD, explanation: '', supporting: [], action: null },
          ])[0]
        }
      />
    );

    const post = screen.getByRole('article');
    expect(within(post).queryByRole('list')).not.toBeInTheDocument();
    expect(post.querySelector('.changelog-post__lead')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('keeps long headlines and many bullets axe-clean', async () => {
    const supporting = Array.from({ length: 6 }, (_, i) => `Detail ${i + 1}`);
    const { container } = render(
      <ChangelogDayRow
        day={
          groupCustomerChangelogByDay([
            {
              ...LEAD,
              title:
                'Play release previews right on a profile, from every release card, with playback that pauses',
              supporting,
            },
          ])[0]
        }
      />
    );

    expect(
      within(screen.getByRole('article')).getAllByRole('listitem')
    ).toHaveLength(6);
    await expectNoA11yViolations(container);
  });

  it('renders an Arabic post right to left', async () => {
    const title = 'شغّل معاينات الإصدار مباشرة من الملف';
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <ChangelogDayRow
          day={groupCustomerChangelogByDay([{ ...LEAD, title }])[0]}
        />
      </div>
    );

    expect(
      screen.getByRole('button', { name: `Copy Link To “${title}”` })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
