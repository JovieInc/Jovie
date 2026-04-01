'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  DrawerPropertyRow,
  DrawerSurfaceCard,
} from '@/components/molecules/drawer';
import { LINEAR_SURFACE } from '@/features/dashboard/tokens';
import { cn } from '@/lib/utils';
import { fetchReleaseCreditsAction } from './release-credits-action';

interface CreditEntry {
  artistId: string;
  name: string;
  handle: string | null;
  role: string;
  position: number;
}

interface CreditGroup {
  role: string;
  label: string;
  entries: CreditEntry[];
}

const LABEL_CLASSNAME =
  'text-[10px] font-[500] leading-[13px] tracking-[0.01em] text-quaternary-token';
const VALUE_CLASSNAME =
  'text-[12px] font-[460] leading-[16px] text-secondary-token';
const ROW_CLASSNAME = 'rounded-none px-0 py-1 first:pt-0 last:pb-0';

export function ReleaseCreditsSection({
  releaseId,
  variant = 'card',
}: Readonly<{ releaseId: string; variant?: 'card' | 'flat' }>) {
  const [credits, setCredits] = useState<CreditGroup[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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
  }, [releaseId]);

  // Don't render the card if still loading or no credits
  if (loading || !credits || credits.length === 0) return null;

  // Filter out main_artist since they're already shown in the sidebar header
  const visibleCredits = credits.filter(
    g => g.role !== 'main_artist' && g.entries.length > 0
  );
  if (visibleCredits.length === 0) return null;

  return (
    <DrawerSurfaceCard
      variant={variant}
      className={cn(
        variant === 'card' && LINEAR_SURFACE.drawerCardSm,
        'overflow-hidden'
      )}
      testId='release-credits-card'
    >
      <div className='p-3'>
        <p className='mb-2 text-[11px] font-[550] uppercase tracking-[0.06em] text-quaternary-token'>
          Credits
        </p>
        <div className='space-y-0.5'>
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
      </div>
    </DrawerSurfaceCard>
  );
}
