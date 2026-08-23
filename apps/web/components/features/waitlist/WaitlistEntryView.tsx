import { APP_ROUTES } from '@/constants/routes';
import { AuthLayout, AuthShell } from '@/features/auth';

/** Public waitlist front door. Auth completion continues into intake on /start. */
export function WaitlistEntryView() {
  return (
    <AuthLayout
      formTitle='Request access'
      showFormTitle={false}
      showFooterPrompt={false}
      layoutVariant='split'
    >
      <AuthShell
        mode='sign-up'
        fallbackRedirectUrl={APP_ROUTES.START}
        suppressOneTap
      />
    </AuthLayout>
  );
}
