import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import type {
  CustomerChangelogEntry,
  CustomerChangelogMonthGroup,
} from '@/lib/customer-changelog';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { CustomerChangelogArchive } from './CustomerChangelogArchive';

const ENTRY: CustomerChangelogEntry = {
  id: 'customer-update:brand-deals',
  aliases: [],
  title: 'Review qualified brand deals in your Inbox',
  slug: 'review-qualified-brand-deals',
  date: '2026-08-16',
  summary: 'See the buyer, budget, and source.',
  category: 'new',
  capabilities: [],
  surfaces: [],
  availability: 'ga',
  media: null,
  technicalVersion: '26.8.1',
  explanation: 'See the buyer, budget, and source.',
  supporting: [],
  action: null,
  technical: [],
  prominence: 'featured',
};

const FIX: CustomerChangelogEntry = {
  ...ENTRY,
  id: 'customer-update:sign-out',
  slug: 'sign-out-stays-available',
  title: 'Sign-out stays available when the store is missing',
  date: '2026-07-21',
  technicalVersion: '26.7.0',
  category: 'fixed',
  prominence: 'small',
};

const MONTHS: readonly CustomerChangelogMonthGroup[] = [
  { monthKey: '2026-08', label: 'August 2026', entries: [ENTRY] },
  { monthKey: '2026-07', label: 'July 2026', entries: [FIX] },
];

describe('CustomerChangelogArchive certificate', () => {
  beforeEach(() => {
    globalThis.history.replaceState(null, '', '/changelog');
  });

  it('loads earlier months from its control', async () => {
    const user = userEvent.setup();
    const { container } = render(<CustomerChangelogArchive months={MONTHS} />);

    expect(
      screen.getByRole('heading', { name: ENTRY.title })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: FIX.title })
    ).not.toBeInTheDocument();
    await expectNoA11yViolations(container);

    await user.click(
      screen.getByRole('button', { name: 'Load earlier updates' })
    );

    expect(screen.getByRole('heading', { name: FIX.title })).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Load earlier updates' })
    ).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('filters by category and shows a scoped empty message', async () => {
    const user = userEvent.setup();
    const { container } = render(<CustomerChangelogArchive months={MONTHS} />);

    await user.click(screen.getByRole('button', { name: 'Fixed' }));
    expect(screen.getByRole('button', { name: 'Fixed' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByRole('heading', { name: FIX.title })).toBeVisible();
    expect(
      screen.queryByRole('heading', { name: ENTRY.title })
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Removed' }));
    expect(screen.getByText('No removed updates yet.')).toBeVisible();
    await expectNoA11yViolations(container);

    await user.click(screen.getByRole('button', { name: 'All' }));
    expect(
      screen.getByRole('heading', { name: ENTRY.title })
    ).toBeInTheDocument();
  });

  it('drops a failed media frame and keeps the post', async () => {
    const { container } = render(
      <CustomerChangelogArchive
        months={[
          {
            ...MONTHS[0],
            entries: [
              {
                ...ENTRY,
                media: {
                  kind: 'image',
                  src: '/images/changelog/missing-preview.webp',
                  alt: 'Inbox showing a qualified brand deal',
                },
              },
            ],
          },
        ]}
      />
    );

    fireEvent.error(
      screen.getByRole('img', { name: 'Inbox showing a qualified brand deal' })
    );
    expect(container.querySelector('.changelog-entry-media')).toBeNull();
    expect(
      screen.getByRole('heading', { name: ENTRY.title })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('renders the empty archive with its engineering history disclosure', async () => {
    const { container } = render(
      <CustomerChangelogArchive
        months={[]}
        technicalReleases={[{ version: '26.8.1', date: '2026-08-16' }]}
      />
    );

    expect(
      screen.getByText('No updates yet. Check back soon!')
    ).toBeInTheDocument();
    expect(screen.getByText('Browse engineering history')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('renders an Arabic month right to left', async () => {
    const title = 'راجع صفقات العلامات التجارية في صندوق الوارد';
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <CustomerChangelogArchive
          months={[
            {
              monthKey: '2026-08',
              label: 'أغسطس 2026',
              entries: [{ ...ENTRY, title }],
            },
          ]}
        />
      </div>
    );

    expect(screen.getByRole('heading', { name: title })).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
