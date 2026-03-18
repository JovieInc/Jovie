import { redirect } from 'next/navigation';
import { ContentSectionHeader } from '@/components/molecules/ContentSectionHeader';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { PageContent, PageShell } from '@/components/organisms/PageShell';
import { APP_ROUTES } from '@/constants/routes';
import { getCachedAuth } from '@/lib/auth/cached';
import {
  DEFAULT_COMMISSION_DURATION_MONTHS,
  DEFAULT_COMMISSION_RATE_BPS,
  formatCommissionRate,
} from '@/lib/referrals/config';
import {
  getOrCreateReferralCode,
  getReferralStats,
} from '@/lib/referrals/service';
import { ReferralCodeCopyClient } from './ReferralCodeCopyClient';

export const runtime = 'nodejs';

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export default async function SettingsReferralPage() {
  const { userId } = await getCachedAuth();

  if (!userId) {
    redirect(`${APP_ROUTES.SIGNIN}?redirect_url=/app/settings/referral`);
  }

  const [referralResult, stats] = await Promise.all([
    getOrCreateReferralCode(userId),
    getReferralStats(userId),
  ]);

  const commissionRate = formatCommissionRate(DEFAULT_COMMISSION_RATE_BPS);
  const shareUrl = `https://jov.ie?ref=${referralResult.code}`;

  return (
    <PageShell>
      <PageContent>
        <div className='space-y-6'>
          <ContentSurfaceCard>
            <ContentSectionHeader
              title='Referral Program'
              subtitle={`Earn ${commissionRate} commission for ${DEFAULT_COMMISSION_DURATION_MONTHS} months on every artist you refer.`}
            />

            <div className='space-y-4 p-3 pt-0 sm:p-4 sm:pt-0'>
              {/* Referral code + copy */}
              <div className='rounded-lg border border-subtle bg-surface-1 p-4'>
                <p className='mb-2 text-xs font-medium uppercase tracking-wider text-tertiary-token'>
                  Your referral link
                </p>
                <ReferralCodeCopyClient
                  shareUrl={shareUrl}
                  code={referralResult.code}
                />
              </div>

              {/* Terms */}
              <div className='rounded-lg border border-subtle p-4'>
                <p className='text-[13px] font-[510] text-primary-token'>
                  How it works
                </p>
                <ul className='mt-2 space-y-1.5 text-[13px] text-secondary-token'>
                  <li>Share your referral link with other artists</li>
                  <li>
                    When they subscribe to a paid plan, you earn{' '}
                    {commissionRate} of their payment
                  </li>
                  <li>
                    Commission lasts up to {DEFAULT_COMMISSION_DURATION_MONTHS}{' '}
                    months per referral
                  </li>
                  <li>
                    Commission only applies while the referred artist stays
                    subscribed
                  </li>
                </ul>
              </div>
            </div>
          </ContentSurfaceCard>

          {/* Stats */}
          <ContentSurfaceCard>
            <ContentSectionHeader title='Your referral stats' />
            <div className='grid grid-cols-3 gap-4 p-3 pt-0 sm:p-4 sm:pt-0'>
              <div className='rounded-lg border border-subtle p-4 text-center'>
                <p className='text-2xl font-semibold text-primary-token'>
                  {stats.activeReferrals}
                </p>
                <p className='mt-1 text-xs text-tertiary-token'>
                  Active referrals
                </p>
              </div>
              <div className='rounded-lg border border-subtle p-4 text-center'>
                <p className='text-2xl font-semibold text-primary-token'>
                  {formatCents(stats.totalEarningsCents)}
                </p>
                <p className='mt-1 text-xs text-tertiary-token'>Total earned</p>
              </div>
              <div className='rounded-lg border border-subtle p-4 text-center'>
                <p className='text-2xl font-semibold text-primary-token'>
                  {formatCents(stats.pendingEarningsCents)}
                </p>
                <p className='mt-1 text-xs text-tertiary-token'>Pending</p>
              </div>
            </div>
          </ContentSurfaceCard>

          {/* Empty state for referral history */}
          {stats.totalReferrals === 0 ? (
            <ContentSurfaceCard>
              <div className='p-8 text-center'>
                <p className='text-sm text-secondary-token'>
                  No referrals yet. Share your link to start earning!
                </p>
              </div>
            </ContentSurfaceCard>
          ) : null}
        </div>
      </PageContent>
    </PageShell>
  );
}
