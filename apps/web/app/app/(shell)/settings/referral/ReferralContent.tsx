'use client';

import { Button, Input } from '@jovie/ui';
import { AlertTriangle, Check, Copy } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { SettingsPanel } from '@/components/molecules/settings/SettingsPanel';
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
        {Array.from({ length: 3 }, (_, i) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton placeholders never reorder
            key={`skeleton-${i}`}
            className='h-16 animate-pulse rounded-[10px] bg-surface-0'
          />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className='flex items-start gap-2 text-destructive'>
        <AlertTriangle className='mt-0.5 h-4 w-4 shrink-0' aria-hidden />
        <p className='text-[13px] leading-[18px]'>{error}</p>
      </div>
    );
  }

  return (
    <div className='space-y-4'>
      {/* Referral link */}
      <SettingsPanel
        title='Your referral link'
        description='Share this link with other creators. When they sign up and subscribe, you earn a commission.'
      >
        <div className='px-4 py-4 sm:px-5'>
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
      </SettingsPanel>

      {/* Stats */}
      {stats && (
        <SettingsPanel title='Earnings'>
          <div className='grid gap-3 px-4 py-4 sm:grid-cols-2 sm:px-5 lg:grid-cols-4'>
            <ContentSurfaceCard surface='nested' className='p-3.5'>
              <p className='text-[11px] uppercase tracking-[0.08em] text-tertiary-token'>
                Total referrals
              </p>
              <p className='mt-1 text-[18px] font-[560] tabular-nums tracking-[-0.016em] text-primary-token'>
                {String(stats.totalReferrals)}
              </p>
              <p className='mt-1 text-[12px] leading-[18px] text-secondary-token'>
                Creators who signed up with your link
              </p>
            </ContentSurfaceCard>
            <ContentSurfaceCard surface='nested' className='p-3.5'>
              <p className='text-[11px] uppercase tracking-[0.08em] text-tertiary-token'>
                Active
              </p>
              <p className='mt-1 text-[18px] font-[560] tabular-nums tracking-[-0.016em] text-primary-token'>
                {String(stats.activeReferrals)}
              </p>
              <p className='mt-1 text-[12px] leading-[18px] text-secondary-token'>
                Currently on a paid plan
              </p>
            </ContentSurfaceCard>
            <ContentSurfaceCard surface='nested' className='p-3.5'>
              <p className='text-[11px] uppercase tracking-[0.08em] text-tertiary-token'>
                Total earned
              </p>
              <p className='mt-1 text-[18px] font-[560] tabular-nums tracking-[-0.016em] text-primary-token'>
                {`$${(stats.totalEarningsCents / 100).toFixed(2)}`}
              </p>
              <p className='mt-1 text-[12px] leading-[18px] text-secondary-token'>
                Lifetime commission earnings
              </p>
            </ContentSurfaceCard>
            <ContentSurfaceCard surface='nested' className='p-3.5'>
              <p className='text-[11px] uppercase tracking-[0.08em] text-tertiary-token'>
                Pending
              </p>
              <p className='mt-1 text-[18px] font-[560] tabular-nums tracking-[-0.016em] text-primary-token'>
                {`$${(stats.pendingEarningsCents / 100).toFixed(2)}`}
              </p>
              <p className='mt-1 text-[12px] leading-[18px] text-secondary-token'>
                Awaiting payout
              </p>
            </ContentSurfaceCard>
          </div>
        </SettingsPanel>
      )}

      {/* Program terms */}
      {stats?.programTerms && (
        <SettingsPanel title='Program terms'>
          <div className='px-4 py-4 sm:px-5'>
            <p className='text-[13px] leading-[18px] text-secondary-token'>
              Earn {stats.programTerms.commissionRate} commission on every
              referred subscription for {stats.programTerms.durationMonths}{' '}
              months.
            </p>
          </div>
        </SettingsPanel>
      )}
    </div>
  );
}
