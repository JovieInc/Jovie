'use client';

import { Button } from '@jovie/ui/atoms/button';
import type { LucideIcon } from 'lucide-react';
import { CircleMinus, Sparkles, Star, TrendingUp, Wrench } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { useRef, useState } from 'react';
import type {
  ChangelogInlineNode,
  ChangelogRelease,
  ChangelogSection,
} from '@/lib/changelog-parser';
import { parseChangelogInline } from '@/lib/changelog-parser';

const INITIAL_RELEASE_COUNT = 25;
const RELEASE_BATCH_SIZE = 25;

/**
 * Section taxonomy for the release body (pen iekBP): tag pill + editorial
 * heading + per-item status icon. Tones resolve to registered semantic status
 * utilities (featured=info, new=success/mint, improved=accent/ion,
 * fixed=warning/orange, removed=error/red) — the named accent scale classes
 * (accent-green, accent-purple, …) are not registered as Tailwind utilities
 * on this surface, so the pen accent hexes map onto the status ramp.
 */
const SECTION_META: Record<
  keyof ChangelogSection,
  {
    readonly label: string;
    readonly title: string;
    readonly headingId: string;
    readonly tagClass: string;
    readonly iconClass: string;
    readonly icon: LucideIcon;
  }
> = {
  featured: {
    label: 'Featured',
    title: 'Featured',
    headingId: 'featured',
    tagClass: 'bg-info-subtle text-info',
    iconClass: 'text-info',
    icon: Star,
  },
  added: {
    label: 'New',
    // ui-casing-allow: founder-locked pen copy (iekBP "What's new")
    title: "What's new",
    headingId: 'whats-new',
    tagClass: 'bg-success-subtle text-success',
    iconClass: 'text-success',
    icon: Sparkles,
  },
  changed: {
    label: 'Improved',
    title: 'Improved',
    headingId: 'improved',
    tagClass: 'bg-accent-subtle text-accent',
    iconClass: 'text-accent',
    icon: TrendingUp,
  },
  fixed: {
    label: 'Fixed',
    title: 'Fixed',
    headingId: 'fixed',
    tagClass: 'bg-warning-subtle text-warning',
    iconClass: 'text-warning',
    icon: Wrench,
  },
  removed: {
    label: 'Removed',
    title: 'Removed',
    headingId: 'removed',
    tagClass: 'bg-error-subtle text-error',
    iconClass: 'text-error',
    icon: CircleMinus,
  },
};

const SECTION_ORDER = Object.keys(SECTION_META) as (keyof ChangelogSection)[];

function formatDate(iso: string): string {
  if (!iso) return '';
  try {
    return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC',
    });
  } catch {
    return iso;
  }
}

/**
 * Render the two inline constructs emitted by CHANGELOG.md without accepting
 * arbitrary HTML. React escapes every captured value, so changelog copy can
 * express emphasis and code while remaining safe for the public route.
 */
function renderInlineNodes(
  nodes: readonly ChangelogInlineNode[],
  keyPrefix: string
): ReactNode[] {
  return nodes.map((node, index) => {
    const key = `${keyPrefix}-${index}`;
    if (node.type === 'text') return node.value;
    if (node.type === 'code') {
      return (
        <code
          key={key}
          className='rounded-sm bg-surface-1 px-1 py-0.5 font-mono text-primary-token'
        >
          {node.value}
        </code>
      );
    }
    return (
      <strong key={key} className='font-medium text-primary-token'>
        {renderInlineNodes(node.children, key)}
      </strong>
    );
  });
}

function renderInlineMarkdown(value: string, keyPrefix: string): ReactNode[] {
  return renderInlineNodes(parseChangelogInline(value), keyPrefix);
}

/**
 * Split a `**Bold title:** explanation` bullet into the pen item anatomy
 * (title line + supporting line). Entries without the convention render as a
 * single supporting line.
 */
function splitEntryTitle(entry: string): {
  readonly title: string | null;
  readonly body: string;
} {
  const match = /^\*\*(.+?)\*\*\s*([\s\S]*)$/.exec(entry.trim());
  if (!match) return { title: null, body: entry };
  const title = match[1].replace(/[:—-]\s*$/, '').trim();
  const body = match[2].trim();
  if (!title) return { title: null, body: entry };
  return { title, body: body || '' };
}

function ReleaseSectionBlock({
  sectionKey,
  entries,
  releaseVersion,
}: {
  readonly sectionKey: keyof ChangelogSection;
  readonly entries: readonly string[];
  readonly releaseVersion: string;
}) {
  const meta = SECTION_META[sectionKey];
  const Icon = meta.icon;
  const headingId = `changelog-${releaseVersion}-${meta.headingId}`;
  const seenEntryKeys = new Map<string, number>();

  return (
    <section aria-labelledby={headingId}>
      <div className='flex flex-wrap items-center gap-3 pb-4'>
        <span
          className={`inline-block rounded-full px-3 py-1 font-mono text-2xs font-semibold tracking-wide ${meta.tagClass}`}
        >
          {meta.label}
        </span>
        <h2
          id={headingId}
          className='changelog-section-title line-clamp-2 text-primary-token'
        >
          {meta.title}
        </h2>
      </div>
      <ul>
        {entries.map(entry => {
          const entryBaseKey = `${releaseVersion}-${sectionKey}-${entry}`;
          const seenCount = seenEntryKeys.get(entryBaseKey) ?? 0;
          seenEntryKeys.set(entryBaseKey, seenCount + 1);
          const itemKey =
            seenCount === 0 ? entryBaseKey : `${entryBaseKey}-${seenCount + 1}`;
          const { title, body } = splitEntryTitle(entry);

          return (
            <li
              key={itemKey}
              className='flex items-start gap-4 border-t border-subtle py-5'
            >
              <Icon
                aria-hidden='true'
                className={`size-4 shrink-0 ${meta.iconClass}`}
              />
              <div className='min-w-0 flex-1 space-y-1.5'>
                {title && (
                  <p className='text-base font-semibold text-primary-token'>
                    {renderInlineMarkdown(title, `${itemKey}-title`)}
                  </p>
                )}
                {body && (
                  <p className='text-sm leading-normal text-secondary-token'>
                    {renderInlineMarkdown(body, `${itemKey}-body`)}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export interface ChangelogTimelineProps {
  readonly releases: readonly ChangelogRelease[];
  /**
   * Entry chrome (version link, date, summary) is the list context's header.
   * The /changelog/[version] route renders its own release header, so it
   * passes false to keep one version identity per page.
   */
  readonly showEntryHeader?: boolean;
}

/**
 * Pure, bounded presentation body for the public changelog timeline.
 *
 * The route owns filesystem parsing and caching. Keeping those concerns out of
 * this component gives Storybook and Pen one deterministic source-backed state
 * without copying the production timeline markup.
 */
export function ChangelogTimeline({
  releases,
  showEntryHeader = true,
}: ChangelogTimelineProps) {
  const statusRef = useRef<HTMLSpanElement>(null);
  const [requestedVisibleCount, setRequestedVisibleCount] = useState(
    INITIAL_RELEASE_COUNT
  );

  if (releases.length === 0) {
    return (
      <div data-reduced-motion='static'>
        <p className='text-secondary-token'>No updates yet. Check back soon!</p>
      </div>
    );
  }

  const visibleCount = Math.min(requestedVisibleCount, releases.length);
  const visibleReleases = releases.slice(0, visibleCount);
  const remainingCount = releases.length - visibleCount;
  const nextBatchCount = Math.min(RELEASE_BATCH_SIZE, remainingCount);
  const hasProgressiveDisclosure = releases.length > INITIAL_RELEASE_COUNT;

  return (
    <div data-reduced-motion='static'>
      <div id='changelog-release-list'>
        {visibleReleases.map((release, releaseIndex) => (
          <article
            key={`${release.version}-${release.date ?? 'unreleased'}`}
            id={`v${release.version}`}
            className='border-t border-subtle py-12 first:border-t-0 first:pt-0'
            aria-posinset={releaseIndex + 1}
            aria-setsize={releases.length}
          >
            {showEntryHeader && (
              <div className='mb-8'>
                <div className='flex flex-wrap items-center gap-3'>
                  <Link
                    href={`/changelog/${encodeURIComponent(release.version)}`}
                    className='font-mono text-sm font-medium text-accent underline-offset-4 transition-colors duration-subtle hover:underline'
                  >
                    {/* ui-casing-allow: semantic version string */}v
                    {release.version}
                  </Link>
                  {release.date && (
                    <span className='text-xs text-quaternary-token'>
                      {formatDate(release.date)}
                    </span>
                  )}
                </div>

                {release.summary && (
                  <p className='mt-3 max-w-prose text-sm leading-relaxed text-secondary-token'>
                    {renderInlineMarkdown(
                      release.summary,
                      `${release.version}-summary`
                    )}
                  </p>
                )}
              </div>
            )}

            <div className='space-y-14'>
              {SECTION_ORDER.map(key => {
                const entries = release.sections[key];
                if (!entries || entries.length === 0) return null;
                return (
                  <ReleaseSectionBlock
                    key={key}
                    sectionKey={key}
                    entries={entries}
                    releaseVersion={release.version}
                  />
                );
              })}
            </div>
          </article>
        ))}
      </div>

      {hasProgressiveDisclosure && (
        <div className='mt-10 flex flex-wrap items-center gap-3 border-t border-subtle pt-6'>
          {remainingCount > 0 && (
            <Button
              type='button'
              variant='secondary'
              size='md'
              aria-controls='changelog-release-list'
              onClick={() => {
                if (remainingCount <= RELEASE_BATCH_SIZE) {
                  statusRef.current?.focus({ preventScroll: true });
                }
                setRequestedVisibleCount(current =>
                  Math.min(current + RELEASE_BATCH_SIZE, releases.length)
                );
              }}
            >
              Read More — {nextBatchCount} Update
              {nextBatchCount === 1 ? '' : 's'}
            </Button>
          )}
          <span
            ref={statusRef}
            tabIndex={-1}
            className='text-xs text-tertiary-token'
            aria-live='polite'
          >
            Showing {visibleCount} of {releases.length} updates
          </span>
        </div>
      )}
    </div>
  );
}
