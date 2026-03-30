import { SettingsSection } from '@/features/dashboard/organisms/SettingsSection';
import { ReferralContent } from './ReferralContent';

export const runtime = 'nodejs';

export default function SettingsReferralPage() {
  return (
    <SettingsSection
      id='referral'
      title='Referrals'
      description='Invite other creators and earn commission on their subscriptions.'
    >
      <ReferralContent />
    </SettingsSection>
  );
}
