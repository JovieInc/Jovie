import { AccountDashboard } from '@/components/organisms/AccountDashboard';
import { StandaloneProductPage } from '@/components/organisms/StandaloneProductPage';

export default function AccountPage() {
  return (
    <StandaloneProductPage width='lg'>
      <AccountDashboard />
    </StandaloneProductPage>
  );
}

export const metadata = {
  title: 'Account Settings | Jovie',
  description: 'Manage your account preferences and settings',
};
