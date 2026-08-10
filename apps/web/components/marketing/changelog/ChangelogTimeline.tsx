'use client';

import { Badge } from '@jovie/ui/atoms/badge';
import { Button } from '@jovie/ui/atoms/button';
import type { ReactNode } from 'react';
import { useState } from 'react';
import type {
  ChangelogInlineNode,
  ChangelogRelease,
  ChangelogSection,
} from '@/lib/changelog-parser';
import { parseChangelogInline } from '@/lib/changelog-parser';

const INITIAL_RELEASE_COUNT = 10;
const RELEASE_BATCH_SIZE = 10;

const SECTION_LABELS: Record<
  keyof ChangelogSection,
  { readonly label: string; readonly color: string }
> = {
  added: {
    label: 'New',
    color: 'bg-accent-green-subtle text-accent-green',
  },
  changed: {
    label: 'Improved',
    color: 'bg-accent-blue-subtle text-accent-blue',
  },
  fixed: {
    label: 'Fixed',
    color: 'bg-accent-orange-subtle text-accent-orange',
  },
  removed: {
    label: 'Removed',
    color: 'bg-accent-red-subtle text-accent-red',
  },
};

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
          className='rounded-sm bg-surface-1 px-1 py-0.5 font-mono text-[0.92em] text-primary-token'
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

export interface ChangelogTimelineProps {
  readonly releases: readonly ChangelogRelease[];
}

/**
 * Pure, bounded presentation body for the public changelog timeline.
 *
 * The route owns filesystem parsing and caching. Keeping those concerns out of
 * this component gives Storybook and Pen one deterministic source-backed state
 * without copying the production timeline markup.
 */
export function ChangelogTimeline({ releases }: ChangelogTimelineProps) {
  const [requestedVisibleCount, setRequestedVisibleCount] = useState(
    INITIAL_RELEASE_COUNT
  );

  if (releases.length === 0) {
    return (
      <div className='max-w-3xl' data-reduced-motion='static'>
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
    <div className='max-w-3xl' data-reduced-motion='static'>
      <div id='changelog-release-list' className='space-y-10'>
        {visibleReleases.map((release, releaseIndex) => (
          <article
            key={`${release.version}-${release.date ?? 'unreleased'}`}
            className='relative border-l-2 border-subtle pl-6'
            aria-posinset={releaseIndex + 1}
            aria-setsize={releases.length}
          >
            <div className='absolute -left-1.5 top-1 h-3 w-3 rounded-full bg-tertiary-token opacity-30' />

            <div className='flex flex-wrap items-center gap-2 mb-4'>
              <Badge
                variant='outline'
                className='font-mono text-xs motion-reduce:transition-none'
              >
                {/* ui-casing-allow: semantic version string */}v
                {release.version}
              </Badge>
              {release.date && (
                <span className='text-xs text-tertiary-token'>
                  {formatDate(release.date)}
                </span>
              )}
            </div>

            {release.summary && (
              <p className='text-sm leading-relaxed opacity-60 mb-4'>
                {renderInlineMarkdown(
                  release.summary,
                  `${release.version}-summary`
                )}
              </p>
            )}

            <div className='space-y-4'>
              {(
                Object.entries(SECTION_LABELS) as [
                  keyof ChangelogSection,
                  { readonly label: string; readonly color: string },
                ][]
              ).map(([key, meta]) => {
                const entries = release.sections[key];
                if (!entries || entries.length === 0) return null;
                const seenEntryKeys = new Map<string, number>();
                return (
                  <div key={key}>
                    <span
                      className={`inline-block text-2xs font-medium px-2 py-0.5 rounded-full mb-2 ${meta.color}`}
                    >
                      {meta.label}
                    </span>
                    <ul className='space-y-1.5'>
                      {entries.map(entry => {
                        const entryBaseKey = `${release.version}-${key}-${entry}`;
                        const seenCount = seenEntryKeys.get(entryBaseKey) ?? 0;
                        seenEntryKeys.set(entryBaseKey, seenCount + 1);

                        return (
                          <li
                            key={
                              seenCount === 0
                                ? entryBaseKey
                                : `${entryBaseKey}-${seenCount + 1}`
                            }
                            className='text-sm leading-relaxed opacity-75'
                          >
                            {renderInlineMarkdown(
                              entry,
                              `${release.version}-${key}-${seenCount}`
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
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
              onClick={() =>
                setRequestedVisibleCount(current =>
                  Math.min(current + RELEASE_BATCH_SIZE, releases.length)
                )
              }
            >
              Show {nextBatchCount} More Update
              {nextBatchCount === 1 ? '' : 's'}
            </Button>
          )}
          <span className='text-xs text-tertiary-token' aria-live='polite'>
            Showing {visibleCount} of {releases.length} updates
          </span>
        </div>
      )}
    </div>
  );
}
