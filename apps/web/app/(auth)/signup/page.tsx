import { AuthLayout } from '@/features/auth';
import { SignUpPageClient } from './SignUpPageClient';

export default function SignUpPage() {
  return (
    <AuthLayout formTitle='Create your account' showFooterPrompt={false}>
      <SignUpPageClient />
    </AuthLayout>
  );
}
