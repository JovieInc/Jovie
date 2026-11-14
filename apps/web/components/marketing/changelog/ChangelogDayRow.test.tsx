import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  type CustomerChangelogEntry,
  groupCustomerChangelogByDay,
} from '@/lib/customer-changelog';
import { ChangelogDayRow, changelogVersionHref } from './ChangelogDayRow';

const copy = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/useClipboard', () => ({
  useClipboard: () => ({ copy, isSuccess: false }),
}));

const LEAD: CustomerChangelogEntry = {
  id: 'customer-update:brand-deals',
  aliases: ['brand-deals-legacy'],
  title: 'Review qualified brand deals in your Inbox',
  slug: 'review-qualified-brand-deals',
  date: '2026-08-16',
  summary: 'See the buyer, budget, and source.',
  category: 'new',
  capabilities: ['inbox'],
  surfaces: [],
  availability: 'ga',
  media: null,
  technicalVersion: '2026-08-16',
  explanation: 'See the buyer, budget, and source.',
  supporting: ['Works with every connected profile.'],
  action: null,
  technical: [],
  prominence: 'featured',
};

function fix(index: number): CustomerChangelogEntry {
  return {
    ...LEAD,
    id: `customer-update:fix-${index}`,
    slug: `update-fix-${index}`,
    aliases: index === 1 ? ['legacy-fix-1'] : [],
    title: `Fix headline ${index}`,
    explanation: `Fix explanation ${index}.`,
    supporting: [],
    category: 'fixed',
  };
}

function renderDay(...entries: CustomerChangelogEntry[]) {
  const [day] = groupCustomerChangelogByDay(entries);
  return render(<ChangelogDayRow day={day} />);
}

describe('ChangelogDayRow', () => {
  it('leads with the headline, its lead and bullets, and dates the day once', () => {
    const { container } = renderDay(LEAD);

    expect(
      screen.getByRole('link', { name: 'August 16, 2026' })
    ).toHaveAttribute('href', changelogVersionHref('2026-08-16'));
    expect(container.querySelector('time')).toHaveAttribute(
      'datetime',
      '2026-08-16'
    );
    expect(screen.getByRole('link', { name: LEAD.title })).toHaveAttribute(
      'href',
      '/changelog#review-qualified-brand-deals'
    );
    expect(screen.getByText('New')).toBeVisible();
    expect(screen.getByText(LEAD.explanation)).toBeVisible();
    expect(
      screen.getByText('Works with every connected profile.')
    ).toBeVisible();
    // The legacy fragment stays a target inside its post.
    expect(
      container.querySelector('article#review-qualified-brand-deals')
    ).toContainElement(container.querySelector('#brand-deals-legacy'));
    expect(screen.queryByText('Fixes and polish')).not.toBeInTheDocument();
  });

  it('shows an availability chip and prerequisites only when not generally available', () => {
    renderDay({
      ...LEAD,
      availability: 'limited',
      prerequisites: ['Eligible profiles with updates enabled'],
    });

    expect(screen.getByText('Limited availability')).toBeVisible();
    expect(
      screen.getByText('Eligible profiles with updates enabled')
    ).toBeVisible();
    expect(screen.queryByText('Generally available')).not.toBeInTheDocument();
  });

  it('labels a preview and stays quiet for a generally available update', () => {
    const { unmount } = renderDay({ ...LEAD, availability: 'preview' });
    expect(screen.getByText('Preview')).toBeVisible();
    unmount();

    renderDay(LEAD);
    expect(screen.queryByText('Preview')).not.toBeInTheDocument();
  });

  it('renders an approved next step and never mints an unsafe link', () => {
    renderDay(
      {
        ...LEAD,
        action: {
          label: 'See it on a demo profile',
          href: '/demo/showcase/tim-white-profile?mode=subscribe',
        },
      },
      {
        ...LEAD,
        id: 'customer-update:external',
        slug: 'external',
        aliases: [],
        action: { label: 'Read the guide', href: 'https://jov.ie/blog/guide' },
      },
      {
        ...LEAD,
        id: 'customer-update:unsafe',
        slug: 'unsafe',
        aliases: [],
        action: { label: 'Unsafe', href: 'javascript:alert(1)' },
      }
    );

    expect(
      screen.getByRole('link', { name: /See it on a demo profile/ })
    ).toHaveAttribute(
      'href',
      '/demo/showcase/tim-white-profile?mode=subscribe'
    );
    const external = screen.getByRole('link', { name: /Read the guide/ });
    expect(external).toHaveAttribute('target', '_blank');
    expect(external).toHaveAttribute('rel', 'noopener noreferrer');
    expect(
      screen.queryByRole('link', { name: /Unsafe/ })
    ).not.toBeInTheDocument();
  });

  it('draws approved media only through the renderer the feed passes in', () => {
    const media = { kind: 'image' as const, src: '/a.webp', alt: 'A' };
    const [day] = groupCustomerChangelogByDay([{ ...LEAD, media }]);
    const renderMedia = vi.fn(() => <figure data-testid='media' />);
    const { rerender } = render(<ChangelogDayRow day={day} />);
    expect(screen.queryByTestId('media')).not.toBeInTheDocument();

    rerender(<ChangelogDayRow day={day} renderMedia={renderMedia} />);
    expect(screen.getByTestId('media')).toBeInTheDocument();
    expect(renderMedia).toHaveBeenCalledWith(media);
  });

  it('keeps a long headline as one heading and binds its last two words', () => {
    const longTitle =
      'Review qualified brand deals in your Inbox with buyer context, budget signals, and source attribution across every connected profile';
    renderDay({ ...LEAD, title: longTitle });

    const heading = screen.getByRole('heading', { name: longTitle });
    expect(screen.getAllByRole('heading', { name: longTitle })).toHaveLength(1);
    expect(heading.querySelector('span.inline-block')?.textContent).toBe(
      'connected profile'
    );
  });

  it('collapses the same-day fixes into one quiet list under the day post', () => {
    const { container } = renderDay(LEAD, fix(1), fix(2));

    expect(container.querySelectorAll('.changelog-day')).toHaveLength(1);
    expect(container.querySelectorAll('article.changelog-post')).toHaveLength(
      1
    );
    const items = within(
      screen.getByRole('list', { name: 'Fixes and polish' })
    ).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveAttribute('id', 'update-fix-1');
    expect(items[0]).toHaveTextContent('Fix headline 1Fix explanation 1.');
    // A collapsed fix keeps its permalink and its legacy alias.
    expect(
      within(items[0]).getByRole('link', { name: 'Fix headline 1' })
    ).toHaveAttribute('href', '/changelog#update-fix-1');
    expect(container.querySelector('#legacy-fix-1')).not.toBeNull();
    expect(
      screen.queryByRole('heading', { name: 'Fix headline 1' })
    ).not.toBeInTheDocument();
  });

  it('promotes the first fix to the day post when a day holds only fixes', () => {
    renderDay(fix(1), { ...fix(2), explanation: '' });

    expect(
      screen.getByRole('heading', { name: 'Fix headline 1' })
    ).toBeVisible();
    const items = within(
      screen.getByRole('list', { name: 'Fixes and polish' })
    ).getAllByRole('listitem');
    expect(items).toHaveLength(1);
    expect(items[0]).toHaveTextContent(/^Fix headline 2$/);
  });

  it('copies the post permalink from a control named for its post', () => {
    renderDay(LEAD);

    fireEvent.click(
      screen.getByRole('button', { name: `Copy Link To “${LEAD.title}”` })
    );
    expect(copy).toHaveBeenCalledWith(
      `${window.location.origin}/changelog#review-qualified-brand-deals`
    );
  });
});
