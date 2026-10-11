'use client';

import { Button } from '@jovie/ui/atoms/button';
import { ArrowRight } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FilterChip } from '@/components/molecules/filters/FilterChip';
import { APP_ROUTES } from '@/constants/routes';
import { isSafeChangelogActionHref } from '@/lib/changelog-parser';
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
const MONTH_FRAGMENT_PREFIX = 'changelog-month-';

type CategoryFilter = 'all' | CustomerChangelogCategory;

type FragmentTarget =
  | {
      readonly kind: 'entry';
      readonly entry: CustomerChangelogEntry;
      readonly monthKey: string;
    }
  | { readonly kind: 'month'; readonly monthKey: string };

/**
 * JOV-7489 adds persistent `aliases` to published entries; tolerate their
 * absence until that contract lands so legacy links keep resolving.
 */
function entryFragments(entry: CustomerChangelogEntry): readonly string[] {
  const aliases = (entry as { readonly aliases?: readonly string[] }).aliases;
  return aliases?.length ? [entry.slug, ...aliases] : [entry.slug];
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

const CATEGORY_FILTER_LABELS: Record<CategoryFilter, string> = {
  all: 'All',
  ...CUSTOMER_CHANGELOG_CATEGORY_LABELS,
};

export interface CustomerChangelogArchiveProps {
  readonly months: readonly CustomerChangelogMonthGroup[];
  readonly technicalReleases?: readonly { version: string; date: string }[];
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
              href={versionHref(release.version)}
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

function versionHref(version: string): string {
  return `${APP_ROUTES.CHANGELOG}/${encodeURIComponent(version)}`;
}

/**
 * One approved feature visual per entry, rendered only when the projected
 * media contract supplies an asset. Null, unsupported, or failed media
 * yields no region at all — the entry stays compact and text-first rather
 * than showing decorative placeholder artwork.
 */
function EntryMedia({
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
        // Unoptimized: media srcs come from the receipt-backed contract and
        // are not limited to the optimizer's allowlisted hosts. The 16:9
        // frame reserves the box so fill+lazy loading never shifts layout.
        <Image
          className='changelog-entry-media__asset'
          src={media.src}
          alt={media.alt}
          fill
          sizes='(min-width: 1024px) 56rem, 100vw'
          unoptimized
          onError={() => setFailed(true)}
        />
      )}
    </div>
  );
}

/**
 * Receipt-approved next step (JOV-7493). The parser already fails closed on
 * unsafe destinations; the render re-checks so a stale or hand-built entry
 * can never mint an arbitrary link.
 */
function EntryActionLink({
  action,
}: {
  readonly action: NonNullable<CustomerChangelogEntry['action']>;
}) {
  if (!isSafeChangelogActionHref(action.href)) return null;
  const content = (
    <>
      {action.label}
      <ArrowRight
        aria-hidden='true'
        size={16}
        className='changelog-archive-nav__link-arrow'
      />
    </>
  );
  if (action.href.startsWith('/')) {
    return (
      <Link href={action.href} className='changelog-entry__action'>
        {content}
      </Link>
    );
  }
  return (
    <a
      href={action.href}
      target='_blank'
      rel='noopener noreferrer'
      className='changelog-entry__action'
    >
      {content}
    </a>
  );
}

function EntryRow({ entry }: { readonly entry: CustomerChangelogEntry }) {
  const tertiary = formatCustomerChangelogTertiary(
    entry.date,
    entry.technicalVersion
  );
  const hasLevel2 =
    Boolean(entry.explanation) ||
    entry.supporting.length > 0 ||
    Boolean(entry.prerequisites?.length);
  const hasLevel3 = entry.technical.length > 0;
  const action =
    entry.action && isSafeChangelogActionHref(entry.action.href)
      ? entry.action
      : null;

  return (
    <article
      id={entry.slug}
      tabIndex={-1}
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
          {entry.availability === 'preview' ||
          entry.availability === 'limited' ? (
            <p className='text-sm text-secondary-token'>
              {entry.availability === 'preview'
                ? 'Preview'
                : 'Limited availability'}
            </p>
          ) : null}
          <h3 className='changelog-entry__title'>{entry.title}</h3>
          {entry.media ? <EntryMedia media={entry.media} /> : null}
          {hasLevel2 ? (
            <div className='space-y-2'>
              {entry.explanation ? (
                <p className='changelog-entry__excerpt'>{entry.explanation}</p>
              ) : null}
              {entry.prerequisites?.length ? (
                <p className='changelog-entry__excerpt'>
                  {entry.prerequisites.join(' · ')}
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
          {action ? (
            <p className='changelog-entry__action-row'>
              <EntryActionLink action={action} />
            </p>
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
      </div>
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
      id={`changelog-month-${group.monthKey}`}
      tabIndex={-1}
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
        {group.entries.map(entry => (
          <EntryRow key={entry.slug} entry={entry} />
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
  // Back/Forward, legacy aliases), and clicks on same-page fragment links
  // such as the hero timeline, which may not emit a hashchange.
  useEffect(() => {
    const onHashChange = () => revealFragment(globalThis.location.hash);
    const onClick = (event: MouseEvent) => {
      const anchor = (event.target as Element | null)?.closest?.('a[href]');
      const href = anchor?.getAttribute('href') ?? '';
      if (href.startsWith('#')) revealFragment(href);
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
      <div data-reduced-motion='static'>
        <p className='text-secondary-token'>No updates yet. Check back soon!</p>
        <details className='mb-6'>
          <summary className='min-h-11 cursor-pointer text-sm text-secondary-token'>
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
            Load Earlier Updates
          </Button>
        </div>
      ) : null}

      {filteredMonths.length > 0 ? (
        <details className='mt-6'>
          <summary className='min-h-11 cursor-pointer text-sm text-secondary-token'>
            Browse all updates
          </summary>
          <ArchiveJumpNav months={filteredMonths} />
          <TechnicalReleaseNav releases={technicalReleases} />
        </details>
      ) : null}
    </div>
  );
}
