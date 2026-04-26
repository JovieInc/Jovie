'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { SmartLinkCreditGroup as CreditGroup } from '@/app/[username]/[slug]/_lib/data';
import {
  DrawerPropertyRow,
  DrawerSurfaceCard,
} from '@/components/molecules/drawer';
import { LINEAR_SURFACE } from '@/features/dashboard/tokens';
import { cn } from '@/lib/utils';
import { fetchReleaseCreditsAction } from './release-credits-action';

const LABEL_CLASSNAME =
  'text-[10px] font-[500] leading-[13px] tracking-[0.01em] text-quaternary-token';
const VALUE_CLASSNAME =
  'text-xs font-[460] leading-[16px] text-secondary-token';
const ROW_CLASSNAME = 'rounded-none px-0 py-1 first:pt-0 last:pb-0';

export interface ReleaseCreditsSectionProps {
  readonly releaseId: string;
  readonly variant?: 'card' | 'flat';
  readonly creditsGroups?: CreditGroup[] | null;
}

export function ReleaseCreditsSection({
  releaseId,
  variant = 'card',
  creditsGroups,
}: ReleaseCreditsSectionProps) {
  const [credits, setCredits] = useState<CreditGroup[] | null>(
    creditsGroups ?? null
  );
  const [loading, setLoading] = useState(creditsGroups === undefined);

  useEffect(() => {
    if (creditsGroups !== undefined) {
      setCredits(creditsGroups);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    fetchReleaseCreditsAction(releaseId)
      .then(result => {
        if (!cancelled) setCredits(result);
      })
      .catch(() => {
        if (!cancelled) setCredits(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [creditsGroups, releaseId]);

  // Don't render the card if still loading or no credits
  if (loading || !credits || credits.length === 0) return null;

  // Filter out main_artist since they're already shown in the sidebar header
  const visibleCredits = credits.filter(
    g => g.role !== 'main_artist' && g.entries.length > 0
  );
  if (visibleCredits.length === 0) return null;

  const content = (
    <div className='space-y-0.5' data-testid='release-credits-content'>
      {visibleCredits.map(group => (
        <DrawerPropertyRow
          key={group.role}
          label={group.label}
          labelWidth={90}
          size='sm'
          className={ROW_CLASSNAME}
          labelClassName={LABEL_CLASSNAME}
          valueClassName={VALUE_CLASSNAME}
          value={
            <span>
              {group.entries.map((entry, i) => (
                <span key={`${entry.role}-${entry.artistId}`}>
                  {i > 0 && ', '}
                  {entry.handle ? (
                    <Link
                      href={`/${entry.handle}`}
                      className='hover:text-primary-token transition-colors'
                    >
                      {entry.name}
                    </Link>
                  ) : (
                    entry.name
                  )}
                </span>
              ))}
            </span>
          }
        />
      ))}
    </div>
  );

  if (variant === 'flat') {
    return content;
  }

  return (
    <DrawerSurfaceCard
      className={cn(LINEAR_SURFACE.drawerCardSm, 'overflow-hidden')}
      testId='release-credits-card'
    >
      <div className='p-3'>
        <p className='mb-2 text-2xs font-[550] uppercase tracking-[0.06em] text-quaternary-token'>
          Credits
        </p>
        {content}
      </div>
    </DrawerSurfaceCard>
  );
}
