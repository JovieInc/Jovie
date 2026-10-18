import { AlertTriangle } from 'lucide-react';
import type { OvieCertificationRow } from '@/lib/ovie/certifications/types';
import { CertificationTierGlyph } from './CertificationGlyphs';
import { OPERATIONAL_TIERS, TASTE_TIERS } from './certification-view';

export function CertificationIdentity({
  row,
}: {
  readonly row: OvieCertificationRow;
}) {
  return (
    <span className='flex min-w-0 items-center gap-1.5'>
      <span
        className='truncate text-app font-medium text-primary-token'
        title={row.subject.id}
      >
        {row.subject.title}
      </span>
      {row.staleFounderLock ? (
        <AlertTriangle
          className='h-3 w-3 shrink-0 text-warning'
          aria-label='Stale Founder Approval'
        />
      ) : null}
    </span>
  );
}

export function CertificationEvidenceStrip({
  row,
}: {
  readonly row: OvieCertificationRow;
}) {
  return (
    <span
      className='flex items-center gap-1'
      data-testid='certification-evidence-strip'
    >
      {TASTE_TIERS.map(tier => (
        <CertificationTierGlyph
          key={tier}
          tier={tier}
          status={row.tiers[tier]}
        />
      ))}
      <span className='mx-0.5 h-2.5 w-px bg-(--app-shell-frame-seam)' />
      {OPERATIONAL_TIERS.map(tier => (
        <CertificationTierGlyph
          key={tier}
          tier={tier}
          status={row.tiers[tier]}
        />
      ))}
    </span>
  );
}
