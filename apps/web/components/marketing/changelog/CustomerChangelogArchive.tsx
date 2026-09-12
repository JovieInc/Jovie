'use client';

import { Badge } from '@jovie/ui/atoms/badge';
import { Button } from '@jovie/ui/atoms/button';
import Link from 'next/link';
import { useState } from 'react';
import { APP_ROUTES } from '@/constants/routes';
import {
  CUSTOMER_CHANGELOG_CATEGORY_LABELS,
  type CustomerChangelogEntry,
  type CustomerChangelogMonthGroup,
  formatCustomerChangelogTertiary,
} from '@/lib/customer-changelog';

const INITIAL_MONTH_COUNT = 1;

const CATEGORY_TONE = {
  new: 'success',
  improved: 'info',
  fixed: 'warning',
  removed: 'error',
} as const;

const TITLE_CLASS = {
  featured: 'text-lg font-semibold tracking-tight text-primary-token',
  medium: 'text-base font-semibold tracking-tight text-primary-token',
  small: 'text-sm font-medium text-primary-token',
} as const;

export interface CustomerChangelogArchiveProps {
  readonly months: readonly CustomerChangelogMonthGroup[];
}

function versionHref(version: string): string {
  return `${APP_ROUTES.CHANGELOG}/${encodeURIComponent(version)}`;
}

function OutcomeCard({ entry }: { readonly entry: CustomerChangelogEntry }) {
  const tertiary = formatCustomerChangelogTertiary(
    entry.date,
    entry.technicalVersion
  );
  const hasLevel2 = Boolean(entry.explanation) || entry.supporting.length > 0;
  const hasLevel3 = entry.technical.length > 0;

  return (
    <article
      id={entry.slug}
      className='space-y-2'
      data-changelog-prominence={entry.prominence}
    >
      <div className='flex flex-wrap items-center gap-2'>
        <Badge
          variant='outline'
          size='sm'
          tone={CATEGORY_TONE[entry.category]}
          className='text-2xs uppercase tracking-wide'
        >
          {/* ui-casing-allow: tiny taxonomy badge, not IA heading */}
          {CUSTOMER_CHANGELOG_CATEGORY_LABELS[entry.category]}
        </Badge>
      </div>
      <h3 className={TITLE_CLASS[entry.prominence]}>{entry.title}</h3>
      {hasLevel2 ? (
        <div className='space-y-2'>
          {entry.explanation ? (
            <p className='text-sm leading-relaxed text-secondary-token'>
              {entry.explanation}
            </p>
          ) : null}
          {entry.supporting.length > 0 ? (
            <ul className='space-y-1'>
              {entry.supporting.map(item => (
                <li
                  key={item}
                  className='text-sm leading-relaxed text-secondary-token'
                >
                  {item}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      <p className='text-xs text-tertiary-token'>
        <Link
          href={versionHref(entry.technicalVersion)}
          className='transition-colors hover:text-primary-token'
        >
          {tertiary}
        </Link>
      </p>
      {hasLevel3 ? (
        <details className='text-xs text-tertiary-token'>
          <summary className='cursor-pointer select-none text-tertiary-token transition-colors hover:text-secondary-token'>
            Technical details
          </summary>
          <p className='mt-1.5 leading-relaxed'>
            {entry.technical.join(' · ')}
          </p>
        </details>
      ) : null}
    </article>
  );
}

function MonthSection({
  group,
}: {
  readonly group: CustomerChangelogMonthGroup;
}) {
  return (
    <section
      aria-labelledby={`changelog-month-${group.monthKey}`}
      className='space-y-8'
    >
      <h2
        id={`changelog-month-${group.monthKey}`}
        className='truncate text-sm font-medium text-tertiary-token'
      >
        {group.label}
      </h2>
      <div className='space-y-10'>
        {group.entries.map(entry => (
          <OutcomeCard key={entry.slug} entry={entry} />
        ))}
      </div>
    </section>
  );
}

/**
 * Public `/changelog` archive: month-grouped customer outcomes.
 * Version pages keep ChangelogTimeline for technical detail.
 */
export function CustomerChangelogArchive({
  months,
}: CustomerChangelogArchiveProps) {
  const [visibleMonthCount, setVisibleMonthCount] =
    useState(INITIAL_MONTH_COUNT);

  if (months.length === 0) {
    return (
      <div className='max-w-3xl' data-reduced-motion='static'>
        <p className='text-secondary-token'>No updates yet. Check back soon!</p>
      </div>
    );
  }

  const visibleCount = Math.min(visibleMonthCount, months.length);
  const visibleMonths = months.slice(0, visibleCount);
  const remainingCount = months.length - visibleCount;

  return (
    <div className='max-w-3xl' data-reduced-motion='static'>
      <div id='changelog-outcome-list' className='space-y-14'>
        {visibleMonths.map(group => (
          <MonthSection key={group.monthKey} group={group} />
        ))}
      </div>

      {remainingCount > 0 ? (
        <div className='mt-10 border-t border-subtle pt-6'>
          <Button
            type='button'
            variant='secondary'
            size='md'
            aria-controls='changelog-outcome-list'
            onClick={() =>
              setVisibleMonthCount(current =>
                Math.min(current + 1, months.length)
              )
            }
          >
            Load Earlier Updates
          </Button>
        </div>
      ) : null}
    </div>
  );
}
