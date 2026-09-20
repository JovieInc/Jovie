'use client';

import { Button } from '@jovie/ui/atoms/button';
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { APP_ROUTES } from '@/constants/routes';
import {
  CUSTOMER_CHANGELOG_CATEGORY_LABELS,
  type CustomerChangelogEntry,
  type CustomerChangelogMonthGroup,
  formatCustomerChangelogDate,
  formatCustomerChangelogTertiary,
} from '@/lib/customer-changelog';

const INITIAL_MONTH_COUNT = 1;

/**
 * Entry media gradient accent by recency rank (pen O64tu: ion, pulse,
 * ultra — the locked card triad). One gradient atom; tone is the only
 * per-entry parameter.
 */
const ENTRY_MEDIA_TONES = ['ion', 'pulse', 'ultra'] as const;
type EntryMediaTone = (typeof ENTRY_MEDIA_TONES)[number];

export interface CustomerChangelogArchiveProps {
  readonly months: readonly CustomerChangelogMonthGroup[];
}

function versionHref(version: string): string {
  return `${APP_ROUTES.CHANGELOG}/${encodeURIComponent(version)}`;
}

function EntryMedia({
  tone,
  variant,
}: {
  readonly tone: EntryMediaTone;
  readonly variant: 'feature' | 'card';
}) {
  return (
    <div
      aria-hidden='true'
      className={`changelog-entry-media changelog-entry-media--${variant} changelog-entry-media--${tone}`}
    />
  );
}

function EntryRow({
  entry,
  tone,
}: {
  readonly entry: CustomerChangelogEntry;
  readonly tone: EntryMediaTone;
}) {
  const tertiary = formatCustomerChangelogTertiary(
    entry.date,
    entry.technicalVersion
  );
  const hasLevel2 = Boolean(entry.explanation) || entry.supporting.length > 0;
  const hasLevel3 = entry.technical.length > 0;

  return (
    <article
      id={entry.slug}
      className='changelog-entry'
      data-changelog-prominence={entry.prominence}
    >
      <p className='changelog-entry__date'>
        {formatCustomerChangelogDate(entry.date)}
      </p>
      <div className='changelog-entry__main'>
        <div className='changelog-entry__content'>
          <p className='changelog-entry__category'>
            {/* ui-casing-allow: tiny taxonomy caption, not IA heading */}
            {CUSTOMER_CHANGELOG_CATEGORY_LABELS[entry.category]}
          </p>
          <h3 className='changelog-entry__title'>{entry.title}</h3>
          <EntryMedia tone={tone} variant='feature' />
          {hasLevel2 ? (
            <div className='space-y-2'>
              {entry.explanation ? (
                <p className='changelog-entry__excerpt'>{entry.explanation}</p>
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
          <p className='changelog-entry__tertiary'>
            <Link href={versionHref(entry.technicalVersion)}>{tertiary}</Link>
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
        </div>
        <div className='changelog-entry__card'>
          <EntryMedia tone={tone} variant='card' />
          <p className='changelog-entry__card-title'>{entry.title}</p>
          <p className='changelog-entry__card-meta'>
            {CUSTOMER_CHANGELOG_CATEGORY_LABELS[entry.category]} ·{' '}
            {formatCustomerChangelogDate(entry.date)}
          </p>
        </div>
      </div>
    </article>
  );
}

function MonthSection({
  group,
  toneOffset,
}: {
  readonly group: CustomerChangelogMonthGroup;
  readonly toneOffset: number;
}) {
  return (
    <section
      id={`changelog-month-${group.monthKey}`}
      aria-labelledby={`changelog-month-${group.monthKey}-heading`}
      className='changelog-month-section'
    >
      <h2
        id={`changelog-month-${group.monthKey}-heading`}
        className='truncate pb-6 text-sm font-medium text-tertiary-token'
      >
        {group.label}
      </h2>
      <div>
        {group.entries.map((entry, index) => (
          <EntryRow
            key={entry.slug}
            entry={entry}
            tone={
              ENTRY_MEDIA_TONES[(toneOffset + index) % ENTRY_MEDIA_TONES.length]
            }
          />
        ))}
      </div>
    </section>
  );
}

function ArchiveJumpNav({
  months,
}: {
  readonly months: readonly CustomerChangelogMonthGroup[];
}) {
  return (
    <nav aria-label='Changelog Archive' className='changelog-archive-nav'>
      {months.map(group => (
        <div key={group.monthKey} className='changelog-archive-nav__row'>
          <div className='changelog-archive-nav__rail'>
            <Link
              href={`#changelog-month-${group.monthKey}`}
              className='changelog-archive-nav__month'
            >
              {group.label}
            </Link>
            <p className='changelog-archive-nav__hint'>Jump to an update</p>
          </div>
          <ul className='changelog-archive-nav__links'>
            {group.entries.map(entry => (
              <li key={entry.slug}>
                <Link
                  href={`#${entry.slug}`}
                  className='changelog-archive-nav__link'
                >
                  <span className='changelog-archive-nav__link-date'>
                    {formatCustomerChangelogDate(entry.date)}
                  </span>
                  <span className='changelog-archive-nav__link-title'>
                    {entry.title}
                    <ArrowRight
                      aria-hidden='true'
                      size={16}
                      className='changelog-archive-nav__link-arrow'
                    />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/**
 * Public `/changelog` archive (pen O64tu entry rows + Q3JwYT jump nav):
 * month-grouped customer outcomes with a sticky date rail. Version pages
 * keep ChangelogTimeline for technical detail.
 */
export function CustomerChangelogArchive({
  months,
}: CustomerChangelogArchiveProps) {
  const [visibleMonthCount, setVisibleMonthCount] =
    useState(INITIAL_MONTH_COUNT);

  if (months.length === 0) {
    return (
      <div data-reduced-motion='static'>
        <p className='text-secondary-token'>No updates yet. Check back soon!</p>
      </div>
    );
  }

  const visibleCount = Math.min(visibleMonthCount, months.length);
  const visibleMonths = months.slice(0, visibleCount);
  const remainingCount = months.length - visibleCount;

  const monthToneOffsets = visibleMonths.map((_, index) =>
    visibleMonths
      .slice(0, index)
      .reduce((sum, group) => sum + group.entries.length, 0)
  );

  return (
    <div data-reduced-motion='static'>
      <ArchiveJumpNav months={visibleMonths} />
      <div id='changelog-outcome-list'>
        {visibleMonths.map((group, index) => (
          <MonthSection
            key={group.monthKey}
            group={group}
            toneOffset={monthToneOffsets[index] ?? 0}
          />
        ))}
      </div>

      {remainingCount > 0 ? (
        <div className='changelog-load-earlier'>
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
