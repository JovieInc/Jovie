'use client';

import type { ReviewInboxPilotCase } from '@/lib/ovie/review-inbox/contract';

interface ReviewInboxEditorialViewProps {
  readonly pilotCase: ReviewInboxPilotCase;
  readonly busy: boolean;
  readonly onRequestChanges: () => void;
  readonly onAcceptV2: () => void;
}

/** One editorial decision at a time with truthful approval disclosure. */
export function ReviewInboxEditorialView({
  pilotCase,
  busy,
  onRequestChanges,
  onAcceptV2,
}: ReviewInboxEditorialViewProps) {
  const canAccept =
    pilotCase.lifecycle === 'changes_requested' &&
    pilotCase.activeRevision === 'v2';
  const canRequest =
    pilotCase.lifecycle === 'awaiting_review' &&
    pilotCase.activeRevision === 'v1';

  return (
    <article
      className='space-y-4 rounded-lg border border-subtle bg-surface-0 p-4'
      data-testid='review-inbox-editorial-view'
    >
      <header className='space-y-1'>
        <h3 className='text-balance text-app font-semibold'>
          {pilotCase.title}
        </h3>
        <p className='text-sm text-secondary-token'>
          {pilotCase.recommendation}
        </p>
      </header>
      <p
        className='rounded-md border border-subtle bg-surface-1 px-3 py-2 text-xs text-secondary-token'
        data-testid='review-inbox-approval-disclosure'
      >
        {pilotCase.approvalDisclosure}
      </p>
      <dl className='grid gap-2 text-xs text-tertiary-token sm:grid-cols-2'>
        <div>
          <dt className='font-medium text-secondary-token'>Active revision</dt>
          <dd>{pilotCase.activeRevision}</dd>
        </div>
        <div>
          <dt className='font-medium text-secondary-token'>Lifecycle</dt>
          <dd>{pilotCase.lifecycle}</dd>
        </div>
      </dl>
      {pilotCase.pins.length ? (
        <ul className='space-y-1 text-xs text-secondary-token'>
          {pilotCase.pins.map(pin => (
            <li key={pin.id}>
              <span className='font-medium'>{pin.author}</span> [{pin.revision}
              ]: {pin.note}
            </li>
          ))}
        </ul>
      ) : null}
      {pilotCase.privateLibraryReceipt ? (
        <p className='text-xs text-secondary-token' role='status'>
          Stored: {pilotCase.privateLibraryReceipt}
        </p>
      ) : (
        <div className='flex flex-wrap gap-2'>
          <button
            type='button'
            disabled={busy || !canRequest}
            className='rounded-lg bg-primary px-3 py-2 text-sm font-medium text-on-primary disabled:opacity-40'
            onClick={onRequestChanges}
          >
            Request changes
          </button>
          <button
            type='button'
            disabled={busy || !canAccept}
            className='rounded-lg border border-subtle px-3 py-2 text-sm disabled:opacity-40'
            onClick={onAcceptV2}
          >
            Accept v2
          </button>
        </div>
      )}
    </article>
  );
}
