'use client';

import { Button } from '@jovie/ui/atoms/button';
import { Rss } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FilterChip } from '@/components/molecules/filters/FilterChip';
import { APP_ROUTES } from '@/constants/routes';
import {
  CUSTOMER_CHANGELOG_CATEGORIES,
  CUSTOMER_CHANGELOG_CATEGORY_LABELS,
  type CustomerChangelogCategory,
  type CustomerChangelogEntry,
  type CustomerChangelogMonthGroup,
  type CustomerChangelogTombstone,
  customerChangelogEntryPath,
  formatCustomerChangelogDate,
  groupCustomerChangelogByDay,
} from '@/lib/customer-changelog';
import { ChangelogDayRow, changelogVersionHref } from './ChangelogDayRow';

const INITIAL_MONTH_COUNT = 1;
const MONTH_FRAGMENT_PREFIX = 'changelog-month-';

type CategoryFilter = 'all' | CustomerChangelogCategory;

type FragmentTarget =
  | {
      readonly kind: 'entry';
      readonly entry: CustomerChangelogEntry;
      readonly monthKey: string;
    }
  | { readonly kind: 'month'; readonly monthKey: string };

function entryFragments(entry: CustomerChangelogEntry): readonly string[] {
  return [entry.slug, ...entry.aliases];
}

/**
 * One entry-navigation resolver (JOV-7490): maps a URL fragment to the entry
 * or month section that owns it, regardless of pagination or the active
 * category filter. Unknown or removed fragments resolve to null so callers
 * never land on a different entry.
 */
function locateChangelogFragment(
  months: readonly CustomerChangelogMonthGroup[],
  rawFragment: string
): FragmentTarget | null {
  let fragment = rawFragment.startsWith('#')
    ? rawFragment.slice(1)
    : rawFragment;
  try {
    fragment = decodeURIComponent(fragment);
  } catch {
    // Undecodable fragments cannot match a target.
  }
  if (!fragment) return null;

  if (fragment.startsWith(MONTH_FRAGMENT_PREFIX)) {
    const monthKey = fragment.slice(MONTH_FRAGMENT_PREFIX.length);
    return months.some(group => group.monthKey === monthKey)
      ? { kind: 'month', monthKey }
      : null;
  }

  for (const group of months) {
    for (const entry of group.entries) {
      if (entryFragments(entry).includes(fragment)) {
        return { kind: 'entry', entry, monthKey: group.monthKey };
      }
    }
  }
  return null;
}

function filterMonthsByCategory(
  months: readonly CustomerChangelogMonthGroup[],
  category: CategoryFilter
): readonly CustomerChangelogMonthGroup[] {
  if (category === 'all') return months;
  return months
    .map(group => ({
      ...group,
      entries: group.entries.filter(entry => entry.category === category),
    }))
    .filter(group => group.entries.length > 0);
}

const RSS_LABEL = 'RSS feed';

const CATEGORY_FILTER_LABELS: Record<CategoryFilter, string> = {
  all: 'All',
  ...CUSTOMER_CHANGELOG_CATEGORY_LABELS,
};

export interface CustomerChangelogArchiveProps {
  readonly months: readonly CustomerChangelogMonthGroup[];
  readonly tombstones?: readonly CustomerChangelogTombstone[];
  readonly technicalReleases?: readonly { version: string; date: string }[];
}

function TombstoneNotices({
  tombstones,
}: {
  readonly tombstones: readonly CustomerChangelogTombstone[];
}) {
  return tombstones.flatMap(tombstone =>
    [tombstone.slug, ...tombstone.aliases].map(fragment => (
      <p
        key={fragment}
        id={fragment}
        role='status'
        className='hidden scroll-mt-24 py-4 text-secondary-token target:block'
      >
        This update is no longer published.
      </p>
    ))
  );
}

function TechnicalReleaseNav({
  releases,
}: {
  readonly releases: readonly { version: string; date: string }[];
}) {
  if (!releases.length) return null;
  return (
    <nav aria-label='Technical Release Log' className='changelog-archive-nav'>
      <p className='text-sm text-secondary-token'>Engineering history</p>
      <ul className='changelog-archive-nav__links'>
        {releases.map(release => (
          <li key={release.version}>
            <Link
              href={changelogVersionHref(release.version)}
              className='changelog-archive-nav__link'
            >
              <span className='changelog-archive-nav__link-date'>
                {formatCustomerChangelogDate(release.date)}
              </span>
              <span className='changelog-archive-nav__link-title'>
                {release.version}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/**
 * One approved feature visual per post, rendered only when the entry carries
 * an asset. Missing or failed media yields no region at all: the post stays
 * text-first instead of showing placeholder artwork.
 */
export function ChangelogEntryMedia({
  media,
}: {
  readonly media: NonNullable<CustomerChangelogEntry['media']>;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;

  return (
    <div className='changelog-entry-media'>
      {media.kind === 'video' ? (
        <video
          className='changelog-entry-media__asset'
          controls
          muted
          playsInline
          preload='metadata'
          src={media.src}
          aria-label={media.alt || undefined}
          onError={() => setFailed(true)}
        />
      ) : (
        // The 16:9 frame reserves the box, so fill + lazy loading never
        // shifts layout.
        <Image
          className='changelog-entry-media__asset'
          src={media.src}
          alt={media.alt}
          fill
          sizes='(min-width: 1024px) 45rem, 100vw'
          unoptimized
          onError={() => setFailed(true)}
        />
      )}
    </div>
  );
}

const renderEntryMedia = (
  media: NonNullable<CustomerChangelogEntry['media']>
) => <ChangelogEntryMedia media={media} />;

function MonthSection({
  group,
}: {
  readonly group: CustomerChangelogMonthGroup;
}) {
  const days = useMemo(
    () => groupCustomerChangelogByDay(group.entries),
    [group.entries]
  );
  return (
    <section
      id={`${MONTH_FRAGMENT_PREFIX}${group.monthKey}`}
      tabIndex={-1}
      aria-labelledby={`${MONTH_FRAGMENT_PREFIX}${group.monthKey}-heading`}
      className='changelog-month-section'
    >
      {/* Every day row carries its full date, so the month is structure only. */}
      <h2
        id={`${MONTH_FRAGMENT_PREFIX}${group.monthKey}-heading`}
        className='sr-only'
      >
        {group.label}
      </h2>
      {days.map(day => (
        <ChangelogDayRow
          key={day.date || 'undated'}
          day={day}
          renderMedia={renderEntryMedia}
        />
      ))}
    </section>
  );
}

const CATEGORY_FILTER_OPTIONS: readonly CategoryFilter[] = [
  'all',
  ...CUSTOMER_CHANGELOG_CATEGORIES,
];

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
      <div className='changelog-filter-toolbar__chips'>
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
      <Link
        href={`${APP_ROUTES.CHANGELOG}/feed.xml`}
        className='changelog-subscribe__alt'
      >
        <Rss aria-hidden='true' size={14} />
        <span className='changelog-subscribe__alt-label'>{RSS_LABEL}</span>
      </Link>
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
              href={`#${MONTH_FRAGMENT_PREFIX}${group.monthKey}`}
              className='changelog-archive-nav__month'
            >
              {group.label}
            </Link>
          </div>
          <ul className='changelog-archive-nav__links'>
            {group.entries.map(entry => (
              <li key={entry.id}>
                <Link
                  href={customerChangelogEntryPath(entry)}
                  className='changelog-archive-nav__link'
                >
                  <span className='changelog-archive-nav__link-date'>
                    {formatCustomerChangelogDate(entry.date)}
                  </span>
                  <span className='changelog-archive-nav__link-title'>
                    {entry.title}
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
 * Public `/changelog` feed: day posts newest first, with a sticky date rail
 * and a reading column. Each day leads with its outcome posts; the day's
 * small fixes collapse into one "Fixes and polish" list. Every entry keeps
 * its permalink, legacy aliases, and month anchor.
 */
export function CustomerChangelogArchive({
  months,
  tombstones = [],
  technicalReleases = [],
}: CustomerChangelogArchiveProps) {
  const [visibleMonthCount, setVisibleMonthCount] =
    useState(INITIAL_MONTH_COUNT);
  const [activeCategory, setActiveCategory] = useState<CategoryFilter>('all');
  const [pendingTargetId, setPendingTargetId] = useState<string | null>(null);

  const filteredMonths = useMemo(
    () => filterMonthsByCategory(months, activeCategory),
    [months, activeCategory]
  );

  const revealFragment = useCallback(
    (rawFragment: string) => {
      const target = locateChangelogFragment(months, rawFragment);
      if (!target) return;

      const targetId =
        target.kind === 'month'
          ? `${MONTH_FRAGMENT_PREFIX}${target.monthKey}`
          : target.entry.slug;
      // Reconcile an excluding filter explicitly: a deep link target must
      // never stay hidden behind the active category.
      const nextCategory =
        target.kind === 'entry' &&
        activeCategory !== 'all' &&
        target.entry.category !== activeCategory
          ? 'all'
          : activeCategory;
      const list = filterMonthsByCategory(months, nextCategory);
      const monthIndex = list.findIndex(
        group => group.monthKey === target.monthKey
      );
      if (monthIndex < 0) return;

      if (nextCategory !== activeCategory) setActiveCategory(nextCategory);
      setVisibleMonthCount(current => Math.max(current, monthIndex + 1));
      setPendingTargetId(targetId);
    },
    [months, activeCategory]
  );

  // Resolve deep links on fresh loads, hash changes (in-page links,
  // Back/Forward, legacy aliases), and clicks on same-page fragment links,
  // which may not emit a hashchange.
  useEffect(() => {
    const onHashChange = () => revealFragment(globalThis.location.hash);
    const onClick = (event: MouseEvent) => {
      const anchor = (event.target as Element | null)?.closest?.('a[href]');
      const href = anchor?.getAttribute('href') ?? '';
      if (href.startsWith('#')) revealFragment(href);
      else if (href.startsWith(`${APP_ROUTES.CHANGELOG}#`))
        revealFragment(href.slice(APP_ROUTES.CHANGELOG.length));
    };
    document.addEventListener('click', onClick, true);
    globalThis.addEventListener('hashchange', onHashChange);
    onHashChange();
    return () => {
      document.removeEventListener('click', onClick, true);
      globalThis.removeEventListener('hashchange', onHashChange);
    };
  }, [revealFragment]);

  // Scroll and focus the resolved target once it mounts. Focus only moves in
  // response to an explicit fragment navigation, never on passive renders.
  useEffect(() => {
    if (!pendingTargetId) return;
    const element = document.getElementById(pendingTargetId);
    if (!element) return;
    element.scrollIntoView?.({ block: 'start' });
    element.focus({ preventScroll: true });
    setPendingTargetId(null);
  }, [pendingTargetId, visibleMonthCount, activeCategory]);

  function handleCategoryChange(next: CategoryFilter) {
    setPendingTargetId(null);
    setActiveCategory(next);
    setVisibleMonthCount(INITIAL_MONTH_COUNT);
  }

  if (months.length === 0) {
    return (
      <div data-reduced-motion='static' className='changelog-feed'>
        <TombstoneNotices tombstones={tombstones} />
        <p className='text-secondary-token'>No updates yet. Check back soon!</p>
        <details className='changelog-archive'>
          <summary className='flex min-h-11 w-fit cursor-pointer items-center text-sm text-secondary-token'>
            Browse engineering history
          </summary>
          <TechnicalReleaseNav releases={technicalReleases} />
        </details>
      </div>
    );
  }

  const visibleCount = Math.min(visibleMonthCount, filteredMonths.length);
  const visibleMonths = filteredMonths.slice(0, visibleCount);
  const remainingCount = filteredMonths.length - visibleCount;

  return (
    <div data-reduced-motion='static' className='changelog-feed'>
      <CategoryFilterToolbar
        active={activeCategory}
        onChange={handleCategoryChange}
      />
      <TombstoneNotices tombstones={tombstones} />

      {filteredMonths.length === 0 ? (
        <p className='border-t border-subtle py-10 text-secondary-token'>
          {`No ${CATEGORY_FILTER_LABELS[activeCategory].toLowerCase()} updates yet.`}
        </p>
      ) : (
        <div id='changelog-outcome-list'>
          {visibleMonths.map(group => (
            <MonthSection key={group.monthKey} group={group} />
          ))}
        </div>
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
            {/* ui-casing-allow: marketing changelog, sentence case (Tim, 2026-11-12) */}
            Load earlier updates
          </Button>
        </div>
      ) : null}

      {filteredMonths.length > 0 ? (
        <details className='changelog-archive'>
          <summary className='flex min-h-11 w-fit cursor-pointer items-center text-sm text-secondary-token'>
            Browse all updates
          </summary>
          <ArchiveJumpNav months={filteredMonths} />
          <TechnicalReleaseNav releases={technicalReleases} />
        </details>
      ) : null}
    </div>
  );
}
