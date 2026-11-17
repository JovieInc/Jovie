import { SettingsGroup } from '@/components/molecules/settings/SettingsPanel';
import { SettingsRow } from '@/components/molecules/settings/SettingsRow';
import { SettingsSection } from '@/features/dashboard/organisms/SettingsSection';
import { getCachedAuth } from '@/lib/auth/cached';
import { publicEnv } from '@/lib/env-public';
import {
  DEFAULT_COMMISSION_DURATION_MONTHS,
  DEFAULT_COMMISSION_RATE_BPS,
} from '@/lib/referrals/config';
import { getOrCreateReferralCode } from '@/lib/referrals/service';
import { logger } from '@/lib/utils/logger';
import { ReferralCodeCopyClient } from './ReferralCodeCopyClient';

export const runtime = 'nodejs';

const COMMISSION_PERCENT = DEFAULT_COMMISSION_RATE_BPS / 100;

async function loadReferralCode(): Promise<string | null> {
  try {
    const { userId: appUserId } = await getCachedAuth();
    if (!appUserId) {
      return null;
    }

    const result = await getOrCreateReferralCode(appUserId);
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
    <SettingsSection id='referral' title='Referral'>
      {code && shareUrl ? (
        <SettingsGroup title='Your link'>
          <SettingsRow
            title='Referral link'
            description={`Earn ${COMMISSION_PERCENT}% of every payment from artists you refer, for up to ${DEFAULT_COMMISSION_DURATION_MONTHS} months.`}
          >
            <ReferralCodeCopyClient shareUrl={shareUrl} />
          </SettingsRow>
          <SettingsRow
            title='Referral code'
            description='Applied when someone subscribes through your link.'
            control={
              <span className='text-xs font-medium text-primary-token'>
                {code}
              </span>
            }
          />
        </SettingsGroup>
      ) : (
        <SettingsGroup title='Your link'>
          <SettingsRow
            title='Referral link'
            description="Your referral code isn't available right now. Refresh the page to try again."
          />
        </SettingsGroup>
      )}
    </SettingsSection>
  );
}
