import Link from 'next/link';
import { APP_ROUTES } from '@/constants/routes';
import type { CertificationInboxCard } from '@/lib/agent-os/certification-inbox';
import type { OvieCertificationRow } from '@/lib/ovie/certifications/types';
import { CertificationStateGlyph } from './CertificationGlyphs';
import {
  CertificationEvidenceStrip,
  CertificationIdentity,
} from './CertificationSummary';

/** The table's exact row and the kernel's decision brief, without another status model. */
export function CertificationReviewCard({
  row,
  card,
}: {
  readonly row: OvieCertificationRow;
  readonly card: CertificationInboxCard | null;
}) {
  return (
    <div className='space-y-3' data-testid='certification-review-card'>
      <h3 className='flex min-w-0 items-center gap-2'>
        <CertificationStateGlyph state={row.state} />
        <CertificationIdentity row={row} />
      </h3>
      <CertificationEvidenceStrip row={row} />
      <p className='text-xs text-tertiary-token'>
        Owner: {row.owner ?? 'Unassigned'}
      </p>
      {card ? (
        <dl className='space-y-2 text-xs text-secondary-token'>
          {[
            ['Why now', card.whyNow],
            ['Journey', card.journey],
            ['Revision', card.revision ?? row.source?.sha ?? 'Missing'],
            ['Unblocks', card.unblocks],
            ['Decision', card.decision],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className='font-medium text-primary-token'>{label}</dt>
              <dd className='break-words'>{value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {card ? (
        <details className='text-xs text-secondary-token'>
          <summary className='cursor-pointer'>
            Evidence and decision effects
          </summary>
          <dl className='mt-2 space-y-2'>
            {[
              ['Green evidence', card.greenEvidence.join(' · ')],
              ['Accept', card.consequences.accept],
              ['Reject', card.consequences.reject],
              ['Comment', card.consequences.comment],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className='font-medium text-primary-token'>{label}</dt>
                <dd className='break-words'>{value}</dd>
              </div>
            ))}
          </dl>
        </details>
      ) : null}
      <Link
        className='text-xs text-secondary-token underline'
        href={`${APP_ROUTES.ADMIN_CERTIFICATIONS}?row=${encodeURIComponent(row.id)}`}
      >
        Review certification evidence
      </Link>
    </div>
  );
}
