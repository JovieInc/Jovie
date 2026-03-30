import { SettingsSection } from '@/features/dashboard/organisms/SettingsSection';
import { AdPixelsContent } from './AdPixelsContent';

export const runtime = 'nodejs';

export default function SettingsAdPixelsPage() {
  return (
    <SettingsSection
      id='ad-pixels'
      title='Ad Pixels'
      description='Configure Facebook, Google, and TikTok pixels for retargeting fans who visit your profile.'
    >
      <AdPixelsContent />
    </SettingsSection>
  );
}
