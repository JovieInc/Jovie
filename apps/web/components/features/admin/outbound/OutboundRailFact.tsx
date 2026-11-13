'use client';

import { Button } from '@jovie/ui';
import { useState } from 'react';
import type {
  ContactEvidenceDecision,
  ContactEvidenceItem,
} from '@/lib/contacts/certification';
import { evidenceConfidenceLabel } from '@/lib/contacts/evidence-display';
import { cleanScrapedDisplayName } from '@/lib/profile/scraped-display-name';
import { cn } from '@/lib/utils';

export interface OutboundRailFactProps {
  readonly item: ContactEvidenceItem;
  readonly active: boolean;
  readonly pending: boolean;
  readonly onDecision: (
    item: ContactEvidenceItem,
    decision: ContactEvidenceDecision,
    correction?: string
  ) => Promise<void>;
}

export function OutboundRailFact({
  item,
  active,
  pending,
  onDecision,
}: OutboundRailFactProps) {
  const [correction, setCorrection] = useState('');
  const [correctionError, setCorrectionError] = useState(false);
  const name = item.key === 'canonical:display-name';
  const suggested = name ? cleanScrapedDisplayName(item.value) : null;
  const correctable = name || item.key === 'canonical:handle';
  return (
    <article
      className={cn(
        'space-y-1.5 border-t border-subtle px-1 py-2 first:border-t-0',
        active && 'rounded-md bg-surface-1'
      )}
      aria-current={active ? 'true' : undefined}
    >
      <p className='text-xs font-medium text-primary-token'>
        {name ? 'Name on record' : item.label}
      </p>
      <p className='break-words text-xs text-secondary-token'>
        {item.value || 'Not available'}
      </p>
      {suggested && suggested !== item.value ? (
        <p className='break-words text-xs text-secondary-token'>
          Suggested display: {suggested}
        </p>
      ) : null}
      <p className='text-2xs text-tertiary-token'>
        {evidenceConfidenceLabel(item)}
      </p>
      <fieldset
        className='flex items-center gap-1.5'
        aria-label={`Review ${item.label}`}
      >
        {(['yes', 'no', 'unsure'] as const).map(decision => (
          <Button
            key={decision}
            size='sm'
            variant={item.decision === decision ? 'primary' : 'secondary'}
            disabled={pending}
            aria-pressed={item.decision === decision}
            onClick={() => void onDecision(item, decision)}
          >
            {decision === 'yes' ? 'Yes' : decision === 'no' ? 'No' : 'Unsure'}
          </Button>
        ))}
      </fieldset>
      <div className='space-y-1.5 text-2xs text-secondary-token'>
        <p>
          {item.source || 'Source unknown'} ·{' '}
          {item.observedAt ?? 'Observation date unknown'}
        </p>
        {item.url ? (
          <a
            href={item.url}
            target='_blank'
            rel='noreferrer'
            className='break-words text-link'
          >
            Open source
          </a>
        ) : null}
        {item.rationale ? <p>{item.rationale}</p> : null}
        <p>
          Recorded decision: {item.decision ?? 'Not reviewed'}. Evidence
          revision: <span className='break-all'>{item.revision}</span>
        </p>
        {correctable ? (
          <form
            className='space-y-1.5'
            onSubmit={event => {
              event.preventDefault();
              if (pending) return;
              if (!correction.trim()) {
                setCorrectionError(true);
                return;
              }
              void onDecision(item, 'no', correction);
            }}
          >
            <label className='block text-xs'>
              Correct {item.label}
              <input
                value={correction}
                onChange={event => {
                  setCorrection(event.target.value);
                  setCorrectionError(false);
                }}
                placeholder='Correct value'
                className='mt-1 h-7 w-full rounded-md border border-strong bg-surface-0 px-2 text-xs text-primary-token'
              />
            </label>
            {correctionError ? (
              <p role='alert' className='text-error'>
                Enter a correction before saving.
              </p>
            ) : null}
            <p>
              Saving changes the name or handle on record and requires fresh
              review.
            </p>
            <Button
              size='sm'
              variant='secondary'
              disabled={pending}
              type='submit'
            >
              Save Correction
            </Button>
          </form>
        ) : null}
      </div>
    </article>
  );
}
