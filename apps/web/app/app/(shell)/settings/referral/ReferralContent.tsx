'use client';

import { Button, Input } from '@jovie/ui';
import { Check, Copy } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Icon } from '@/components/atoms/Icon';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { DrawerSurfaceCard } from '@/components/molecules/drawer';
import { BASE_URL } from '@/constants/app';

interface ReferralStats {
  totalReferrals: number;
  activeReferrals: number;
  totalEarningsCents: number;
  pendingEarningsCents: number;
  programTerms: {
    commissionRate: string;
    durationMonths: number;
  };
}

function StatCard({
  label,
  value,
  description,
}: {
  readonly label: string;
  readonly value: string;
  readonly description?: string;
}) {
  return (
    <ContentSurfaceCard surface='nested' className='p-3.5'>
      <p className='text-[11px] uppercase tracking-[0.08em] text-tertiary-token'>
        {label}
      </p>
      <p className='mt-1 text-[18px] font-[560] tabular-nums tracking-[-0.016em] text-primary-token'>
        {value}
      </p>
      {description && (
        <p className='mt-1 text-[12px] leading-[18px] text-secondary-token'>
          {description}
        </p>
      )}
    </ContentSurfaceCard>
  );
}

export function ReferralContent() {
  const [code, setCode] = useState<string | null>(null);
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [codeRes, statsRes] = await Promise.all([
        fetch('/api/referrals/code'),
        fetch('/api/referrals/stats'),
      ]);

      if (!codeRes.ok || !statsRes.ok) {
        setError('Failed to load referral data');
        return;
      }

      const codeData = await codeRes.json();
      setCode(codeData.code);

      const statsData = await statsRes.json();
      setStats(statsData);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to load referral data'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const shareUrl = code ? `${BASE_URL}/signup?ref=${code}` : '';

  const handleCopy = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for HTTP contexts
    }
  };

  if (loading) {
    return (
      <div className='space-y-4'>
        <div className='space-y-2'>
          {Array.from({ length: 3 }, (_, i) => (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton placeholders never reorder
              key={`skeleton-${i}`}
              className='h-16 animate-pulse rounded-lg bg-surface-0'
            />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <DrawerSurfaceCard
        variant='card'
        className='flex items-center gap-2 border-destructive/20 bg-destructive/8 px-3 py-2'
      >
        <Icon
          name='XCircle'
          className='h-3.5 w-3.5 shrink-0 text-destructive'
        />
        <p className='text-xs font-medium text-destructive'>{error}</p>
      </DrawerSurfaceCard>
    );
  }

  return (
    <div className='space-y-6'>
      {/* Referral link */}
      <div className='space-y-3'>
        <div>
          <h3 className='text-[14px] font-[560] text-primary-token'>
            Your referral link
          </h3>
          <p className='mt-0.5 text-[13px] text-secondary-token'>
            Share this link with other creators. When they sign up and
            subscribe, you earn a commission.
          </p>
        </div>

        {code ? (
          <div className='flex gap-2'>
            <Input
              value={shareUrl}
              readOnly
              className='w-full font-mono text-xs'
              onClick={(e: React.MouseEvent<HTMLInputElement>) =>
                (e.target as HTMLInputElement).select()
              }
            />
            <Button
              variant='secondary'
              size='sm'
              onClick={handleCopy}
              className='shrink-0'
            >
              {copied ? (
                <>
                  <Check className='mr-1.5 h-3.5 w-3.5' />
                  Copied
                </>
              ) : (
                <>
                  <Copy className='mr-1.5 h-3.5 w-3.5' />
                  Copy
                </>
              )}
            </Button>
          </div>
        ) : (
          <p className='text-[13px] text-tertiary-token'>
            No referral code yet. One will be generated automatically.
          </p>
        )}
      </div>

      {/* Stats */}
      {stats && (
        <div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-4'>
          <StatCard
            label='Total referrals'
            value={String(stats.totalReferrals)}
            description='Creators who signed up with your link'
          />
          <StatCard
            label='Active'
            value={String(stats.activeReferrals)}
            description='Currently on a paid plan'
          />
          <StatCard
            label='Total earned'
            value={`$${(stats.totalEarningsCents / 100).toFixed(2)}`}
            description='Lifetime commission earnings'
          />
          <StatCard
            label='Pending'
            value={`$${(stats.pendingEarningsCents / 100).toFixed(2)}`}
            description='Awaiting payout'
          />
        </div>
      )}

      {/* Program terms */}
      {stats?.programTerms && (
        <ContentSurfaceCard surface='nested' className='p-4'>
          <p className='text-[13px] font-[560] text-primary-token'>
            Program terms
          </p>
          <p className='mt-1 text-[12px] leading-[18px] text-secondary-token'>
            Earn {stats.programTerms.commissionRate} commission on every
            referred subscription for {stats.programTerms.durationMonths}{' '}
            months.
          </p>
        </ContentSurfaceCard>
      )}
    </div>
  );
}
