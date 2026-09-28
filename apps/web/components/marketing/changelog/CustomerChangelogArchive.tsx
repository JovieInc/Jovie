'use client';

import { Button } from '@jovie/ui/atoms/button';
import {
  ArrowRight,
  CircleMinus,
  type LucideIcon,
  Sparkles,
  TrendingUp,
  Wrench,
} from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { FilterChip } from '@/components/molecules/filters/FilterChip';
import { APP_ROUTES } from '@/constants/routes';
import {
  CUSTOMER_CHANGELOG_CATEGORIES,
  CUSTOMER_CHANGELOG_CATEGORY_LABELS,
  type CustomerChangelogCategory,
  type CustomerChangelogEntry,
  type CustomerChangelogMonthGroup,
  formatCustomerChangelogDate,
  formatCustomerChangelogTertiary,
} from '@/lib/customer-changelog';

const INITIAL_MONTH_COUNT = 1;

type CategoryFilter = 'all' | CustomerChangelogCategory;

const CATEGORY_FILTER_LABELS: Record<CategoryFilter, string> = {
  all: 'All',
  ...CUSTOMER_CHANGELOG_CATEGORY_LABELS,
};

/**
 * Compact source-backed fallback artwork. Customer entries do not currently
 * carry an approved media asset, so the archive uses an icon, a neutral
 * product-update label, and the entry title instead of an empty visual block.
 */
const ENTRY_MEDIA_TONES = ['ion', 'pulse', 'ultra'] as const;
type EntryMediaTone = (typeof ENTRY_MEDIA_TONES)[number];

const ENTRY_MEDIA_ICONS: Record<
  CustomerChangelogEntry['category'],
  LucideIcon
> = {
  new: Sparkles,
  improved: TrendingUp,
  fixed: Wrench,
  removed: CircleMinus,
};

export interface CustomerChangelogArchiveProps {
  readonly months: readonly CustomerChangelogMonthGroup[];
}

function versionHref(version: string): string {
  return `${APP_ROUTES.CHANGELOG}/${encodeURIComponent(version)}`;
}

function EntryMedia({
  entry,
  tone,
  variant,
}: {
  readonly entry: CustomerChangelogEntry;
  readonly tone: EntryMediaTone;
  readonly variant: 'feature' | 'card';
}) {
  const Icon = ENTRY_MEDIA_ICONS[entry.category];

  return (
    <div
      aria-hidden='true'
      className={`changelog-entry-media changelog-entry-media--${variant} changelog-entry-media--${tone}`}
    >
      <Icon
        className='changelog-entry-media__icon'
        size={variant === 'feature' ? 28 : 22}
      />
      <span className='changelog-entry-media__label'>Product update</span>
      <span className='changelog-entry-media__title'>{entry.title}</span>
    </div>
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
          <EntryMedia entry={entry} tone={tone} variant='feature' />
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
          <EntryMedia entry={entry} tone={tone} variant='card' />
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

const CATEGORY_FILTER_OPTIONS: readonly CategoryFilter[] = [
  'all',
  ...CUSTOMER_CHANGELOG_CATEGORIES,
];

/**
 * Secondary category filter (pen O64tu): quiet chips below the outcome
 * hero/lead copy, never the primary IA.
 */
function CategoryFilterToolbar({
  active,
  onChange,
}: {
  readonly active: CategoryFilter;
  readonly onChange: (next: CategoryFilter) => void;
}) {
  return (
    <div
      role='toolbar'
      aria-label='Filter Updates By Category'
      className='changelog-filter-toolbar'
    >
      {CATEGORY_FILTER_OPTIONS.map(option => (
        <FilterChip
          key={option}
          pressed={active === option}
          onClick={() => onChange(option)}
        >
          {CATEGORY_FILTER_LABELS[option]}
        </FilterChip>
      ))}
    </div>
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
  const [activeCategory, setActiveCategory] = useState<CategoryFilter>('all');

  const filteredMonths = useMemo(
    () =>
      activeCategory === 'all'
        ? months
        : months
            .map(group => ({
              ...group,
              entries: group.entries.filter(
                entry => entry.category === activeCategory
              ),
            }))
            .filter(group => group.entries.length > 0),
    [months, activeCategory]
  );

  function handleCategoryChange(next: CategoryFilter) {
    setActiveCategory(next);
    setVisibleMonthCount(INITIAL_MONTH_COUNT);
  }

  if (months.length === 0) {
    return (
      <div data-reduced-motion='static'>
        <p className='text-secondary-token'>No updates yet. Check back soon!</p>
      </div>
    );
  }

  const visibleCount = Math.min(visibleMonthCount, filteredMonths.length);
  const visibleMonths = filteredMonths.slice(0, visibleCount);
  const remainingCount = filteredMonths.length - visibleCount;

  const monthToneOffsets = visibleMonths.map((_, index) =>
    visibleMonths
      .slice(0, index)
      .reduce((sum, group) => sum + group.entries.length, 0)
  );

  return (
    <div data-reduced-motion='static'>
      <CategoryFilterToolbar
        active={activeCategory}
        onChange={handleCategoryChange}
      />

      {filteredMonths.length === 0 ? (
        <p className='text-secondary-token'>
          {`No ${CATEGORY_FILTER_LABELS[activeCategory].toLowerCase()} updates yet.`}
        </p>
      ) : (
        <>
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
        </>
      )}

      {remainingCount > 0 ? (
        <div className='changelog-load-earlier'>
          <Button
            type='button'
            variant='secondary'
            size='md'
            aria-controls='changelog-outcome-list'
            onClick={() =>
              setVisibleMonthCount(current =>
                Math.min(current + 1, filteredMonths.length)
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
