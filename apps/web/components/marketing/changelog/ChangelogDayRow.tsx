'use client';

import { Badge } from '@jovie/ui/atoms/badge';
import { IconButton } from '@jovie/ui/atoms/icon-button';
import { ArrowRight, Check, Link2 } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { NoOrphanText } from '@/components/marketing/NoOrphanText';
import { APP_ROUTES } from '@/constants/routes';
import { useClipboard } from '@/hooks/useClipboard';
import { isSafeChangelogActionHref } from '@/lib/changelog-parser';
import {
  CUSTOMER_CHANGELOG_CATEGORY_LABELS,
  type CustomerChangelogDayGroup,
  type CustomerChangelogEntry,
  customerChangelogEntryPath,
  formatCustomerChangelogDate,
} from '@/lib/customer-changelog';

const POLISH_TITLE = 'Fixes and polish';

const AVAILABILITY_LABELS: Partial<
  Record<CustomerChangelogEntry['availability'], string>
> = {
  preview: 'Preview',
  limited: 'Limited availability',
};

export function changelogVersionHref(version: string): string {
  return `${APP_ROUTES.CHANGELOG}/${encodeURIComponent(version)}`;
}

/** Legacy fragments for an entry: zero-size targets that never take layout. */
function AliasAnchors({
  entry,
}: {
  readonly entry: Pick<CustomerChangelogEntry, 'aliases'>;
}) {
  return entry.aliases.map(fragment => (
    <span
      key={fragment}
      id={fragment}
      aria-hidden='true'
      className='absolute left-0 top-0 h-0 w-0 scroll-mt-24'
    />
  ));
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
      <ArrowRight aria-hidden='true' size={16} />
    </>
  );
  if (action.href.startsWith('/')) {
    return (
      <Link href={action.href} className='changelog-post__action'>
        {content}
      </Link>
    );
  }
  return (
    <a
      href={action.href}
      target='_blank'
      rel='noopener noreferrer'
      className='changelog-post__action'
    >
      {content}
    </a>
  );
}

function CopyLinkButton({
  entry,
}: {
  readonly entry: Pick<CustomerChangelogEntry, 'slug' | 'title'>;
}) {
  const { copy, isSuccess } = useClipboard();
  return (
    <span className='changelog-post__copy'>
      <IconButton
        type='button'
        variant='ghost'
        size='sm'
        ariaLabel={isSuccess ? 'Link Copied' : `Copy Link To “${entry.title}”`}
        onClick={() =>
          void copy(
            `${globalThis.location.origin}${customerChangelogEntryPath(entry)}`
          )
        }
      >
        {isSuccess ? (
          <Check aria-hidden='true' size={16} />
        ) : (
          <Link2 aria-hidden='true' size={16} />
        )}
      </IconButton>
    </span>
  );
}

type EntryMediaRenderer = (
  media: NonNullable<CustomerChangelogEntry['media']>
) => ReactNode;

function Post({
  entry,
  renderMedia,
}: {
  readonly entry: CustomerChangelogEntry;
  readonly renderMedia?: EntryMediaRenderer;
}) {
  const availability = AVAILABILITY_LABELS[entry.availability];
  const action =
    entry.action && isSafeChangelogActionHref(entry.action.href)
      ? entry.action
      : null;

  return (
    <article
      id={entry.slug}
      tabIndex={-1}
      className='changelog-post'
      data-changelog-entry-id={entry.id}
    >
      <AliasAnchors entry={entry} />
      <div className='changelog-post__meta'>
        <Badge tone='neutral' size='sm'>
          {CUSTOMER_CHANGELOG_CATEGORY_LABELS[entry.category]}
        </Badge>
        {availability ? (
          <Badge tone='accent' size='sm'>
            {availability}
          </Badge>
        ) : null}
      </div>
      <div className='changelog-post__heading'>
        <h3 className='changelog-post__title marketing-type-section text-balance'>
          <Link href={customerChangelogEntryPath(entry)}>
            <NoOrphanText>{entry.title}</NoOrphanText>
          </Link>
        </h3>
        <CopyLinkButton entry={entry} />
      </div>
      {entry.explanation ? (
        <p className='changelog-post__lead'>{entry.explanation}</p>
      ) : null}
      {entry.media && renderMedia ? renderMedia(entry.media) : null}
      {entry.supporting.length > 0 ? (
        <ul className='changelog-post__list'>
          {entry.supporting.map(item => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : null}
      {entry.prerequisites?.length ? (
        <p className='changelog-post__note'>
          {entry.prerequisites.join(' · ')}
        </p>
      ) : null}
      {action ? <EntryActionLink action={action} /> : null}
    </article>
  );
}

/**
 * The day's small fixes as one quiet list instead of a card each. A labelled
 * list, not a landmark: one region per day would crowd landmark navigation.
 */
function PolishList({
  date,
  entries,
}: {
  readonly date: string;
  readonly entries: readonly CustomerChangelogEntry[];
}) {
  const headingId = `changelog-polish-${date}`;
  return (
    <div className='changelog-polish'>
      <h3 id={headingId} className='changelog-polish__title text-balance'>
        {POLISH_TITLE}
      </h3>
      <ul aria-labelledby={headingId} className='changelog-polish__list'>
        {entries.map(entry => (
          <li
            key={entry.id}
            id={entry.slug}
            tabIndex={-1}
            className='changelog-polish__item'
            data-changelog-entry-id={entry.id}
          >
            <AliasAnchors entry={entry} />
            <span className='changelog-polish__text'>
              <Link
                href={customerChangelogEntryPath(entry)}
                className='changelog-polish__headline'
              >
                {entry.title}
              </Link>
              {entry.explanation ? (
                <span className='changelog-polish__detail'>
                  {entry.explanation}
                </span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * One day of the public feed: the date on a sticky rail beside the day's
 * posts, then its small fixes as one list. The feed owns media rendering and
 * passes it in, so this row stays free of image and video elements.
 */
export function ChangelogDayRow({
  day,
  renderMedia,
}: {
  readonly day: CustomerChangelogDayGroup;
  /** Draws a post's approved visual; without it posts stay text only. */
  readonly renderMedia?: EntryMediaRenderer;
}) {
  const lead = day.posts[0] ?? day.polish[0];
  const formatted = formatCustomerChangelogDate(day.date);
  return (
    <div className='changelog-day' data-changelog-day={day.date}>
      <div className='changelog-day__rail'>
        {lead ? (
          <Link
            href={changelogVersionHref(lead.technicalVersion)}
            className='changelog-day__date'
          >
            <time dateTime={day.date || undefined}>{formatted}</time>
          </Link>
        ) : null}
      </div>
      <div className='changelog-day__body'>
        {day.posts.map(entry => (
          <Post key={entry.id} entry={entry} renderMedia={renderMedia} />
        ))}
        {day.polish.length > 0 ? (
          <PolishList date={day.date} entries={day.polish} />
        ) : null}
      </div>
    </div>
  );
}
