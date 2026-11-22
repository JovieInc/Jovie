'use client';

import Image from 'next/image';
import type { ReviewInboxPilotCase } from '@/lib/ovie/review-inbox/contract';
import { cn } from '@/lib/utils';

interface ReviewInboxListViewProps {
  readonly pilotCase: ReviewInboxPilotCase;
  readonly selectedRevision: string;
  readonly onSelect: (revision: string) => void;
}

/**
 * Desktop: keyboard list + split preview. Mobile: single-column stack with
 * tap targets (buttons provided by parent).
 */
export function ReviewInboxListView({
  pilotCase,
  selectedRevision,
  onSelect,
}: ReviewInboxListViewProps) {
  const preview =
    pilotCase.candidates.find(c => c.revision === selectedRevision) ??
    pilotCase.candidates[0];

  return (
    <div
      className='grid gap-4 md:grid-cols-2'
      data-testid='review-inbox-list-view'
    >
      <RevisionList
        candidates={pilotCase.candidates}
        activeRevision={pilotCase.activeRevision}
        selectedRevision={selectedRevision}
        onSelect={onSelect}
      />
      {preview ? (
        <figure className='min-w-0 rounded-lg border border-subtle bg-surface-0 p-3'>
          <figcaption className='mb-2 text-xs text-secondary-token'>
            Preview · {preview.label}
          </figcaption>
          <Image
            src={preview.src}
            alt={preview.label}
            width={preview.width}
            height={preview.height}
            unoptimized
            className='h-auto max-h-80 w-full object-contain'
          />
        </figure>
      ) : null}
    </div>
  );
}

function RevisionList({
  candidates,
  activeRevision,
  selectedRevision,
  onSelect,
}: Readonly<{
  candidates: ReviewInboxPilotCase['candidates'];
  activeRevision: string;
  selectedRevision: string;
  onSelect: (revision: string) => void;
}>) {
  return (
    <ul className='min-w-0 space-y-1' aria-label='Revision List'>
      {candidates.map(row => {
        const selected = row.revision === selectedRevision;
        return (
          <li key={row.revision}>
            <button
              type='button'
              className={cn(
                'flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-focus',
                selected && 'bg-surface-1'
              )}
              aria-pressed={selected}
              onClick={() => onSelect(row.revision)}
            >
              <span className='font-medium'>{row.label}</span>
              <span className='text-secondary-token'>
                {row.revision === activeRevision ? 'Active' : 'Archive'}
              </span>
            </button>
          </li>
        );
      })}
      <p className='mt-3 text-xs text-tertiary-token md:hidden'>
        Tap a row to preview. Swipe actions use the editorial view on small
        screens.
      </p>
    </ul>
  );
}
