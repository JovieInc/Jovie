'use client';

import { Button } from '@jovie/ui';
import { useState } from 'react';
import { PRESENCE_BUTTON_DESKTOP_DENSITY } from '@/components/features/presence/PresenceStatusParts';
import { DrawerSection } from '@/components/molecules/drawer';
import type { IdentityDecision } from './connection-suggestion-helpers';
import type { ProfileWorkspaceSurfaceRow } from './data';

const IDENTITY_SOURCE_LABELS: Readonly<Record<string, string>> = {
  creator_profile: 'Jovie profile',
  dsp_match: 'DSP match',
  identity_link: 'public identity link',
  social_link: 'linked social profile',
};

export function IdentityConfirmationSection({
  row,
  onDecision,
}: Readonly<{
  row: ProfileWorkspaceSurfaceRow;
  onDecision: (surfaceId: string, decision: IdentityDecision) => Promise<void>;
}>) {
  const [pendingDecision, setPendingDecision] =
    useState<IdentityDecision | null>(null);
  const [error, setError] = useState<string | null>(null);
  const evidence = row.identityEvidence ?? {
    sourceCount: 0,
    sourceTypes: [],
    confidence: null,
  };
  const sourceSummary = evidence.sourceTypes
    .map(
      sourceType =>
        IDENTITY_SOURCE_LABELS[sourceType] ?? sourceType.replaceAll('_', ' ')
    )
    .join(', ');
  const confidence =
    evidence.confidence === null
      ? null
      : `${Math.round(evidence.confidence * 100)}% match`;
  const evidenceSummary =
    evidence.sourceCount === 0
      ? 'No source has confirmed this identity yet.'
      : [
          `${evidence.sourceCount} live ${evidence.sourceCount === 1 ? 'source' : 'sources'}`,
          sourceSummary,
          confidence,
        ]
          .filter(Boolean)
          .join(' · ');

  const decide = async (decision: IdentityDecision) => {
    setPendingDecision(decision);
    setError(null);
    try {
      await onDecision(row.id, decision);
    } catch {
      setError('Could not save your answer. Try again.');
    } finally {
      setPendingDecision(null);
    }
  };

  return (
    <DrawerSection title='Identity Check' sectionKind='details'>
      <div className='space-y-3 px-1'>
        <div className='space-y-1'>
          <p className='text-sm font-medium text-primary-token'>Is this you?</p>
          <p className='text-xs text-tertiary-token'>{evidenceSummary}</p>
        </div>
        <div className='grid grid-cols-3 gap-2'>
          {(['yes', 'no', 'unsure'] as const).map(decision => (
            <Button
              key={decision}
              type='button'
              size='sm'
              variant={decision === 'yes' ? 'primary' : 'secondary'}
              loading={pendingDecision === decision}
              disabled={pendingDecision !== null}
              className={PRESENCE_BUTTON_DESKTOP_DENSITY}
              onClick={() => void decide(decision)}
            >
              {decision === 'yes' ? 'Yes' : decision === 'no' ? 'No' : 'Unsure'}
            </Button>
          ))}
        </div>
        <p
          className='min-h-4 text-xs text-error'
          role={error ? 'alert' : 'status'}
          aria-live='polite'
        >
          {error}
        </p>
      </div>
    </DrawerSection>
  );
}
