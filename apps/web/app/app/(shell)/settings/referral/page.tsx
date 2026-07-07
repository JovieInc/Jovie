import { SettingsSection } from '@/features/dashboard/organisms/SettingsSection';
import { getCachedAuth } from '@/lib/auth/cached';
import { publicEnv } from '@/lib/env-public';
import {
  DEFAULT_COMMISSION_DURATION_MONTHS,
  DEFAULT_COMMISSION_RATE_BPS,
} from '@/lib/referrals/config';
import {
  getInternalUserId,
  getOrCreateReferralCode,
} from '@/lib/referrals/service';
import { logger } from '@/lib/utils/logger';
import { ReferralCodeCopyClient } from './ReferralCodeCopyClient';

export const runtime = 'nodejs';

const COMMISSION_PERCENT = DEFAULT_COMMISSION_RATE_BPS / 100;

async function loadReferralCode(): Promise<string | null> {
  try {
    const { userId: clerkUserId } = await getCachedAuth();
    if (!clerkUserId) {
      return null;
    }

    const internalUserId = await getInternalUserId(clerkUserId);
    if (!internalUserId) {
      return null;
    }

    const result = await getOrCreateReferralCode(internalUserId);
    return result.code;
  } catch (error) {
    logger.error('Failed to load referral code for settings page:', error);
    return null;
  }
}

export default async function SettingsReferralPage() {
  const code = await loadReferralCode();
  const shareUrl = code
    ? `${publicEnv.NEXT_PUBLIC_APP_URL}/signup?ref=${encodeURIComponent(code)}`
    : null;

  return (
    <SettingsSection
      id='referral'
      title='Referral'
      description={`Earn ${COMMISSION_PERCENT}% of every payment from artists you refer, for up to ${DEFAULT_COMMISSION_DURATION_MONTHS} months.`}
    >
      {code && shareUrl ? (
        <div className='space-y-3'>
          <ReferralCodeCopyClient shareUrl={shareUrl} code={code} />
          <p className='text-xs text-secondary-token'>
            Your code{' '}
            <span className='font-medium text-primary-token'>{code}</span> is
            applied when someone subscribes through your link.
          </p>
        </div>
      ) : (
        <div className='py-4'>
          <p className='text-app text-secondary'>
            Your referral code isn&apos;t available right now. Refresh the page
            to try again.
          </p>
        </div>
      )}
    </SettingsSection>
  );
}
