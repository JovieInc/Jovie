import { Button } from '@jovie/ui';
import { XCircle } from 'lucide-react';
import Link from 'next/link';
import { APP_ROUTES } from '@/constants/routes';
import { AuthLayout } from '@/features/auth';
import { AUTH_SURFACE, FORM_LAYOUT } from '@/lib/auth/constants';
import { cn } from '@/lib/utils';

export const runtime = 'nodejs';

export default function UserCreationFailedPage() {
  return (
    <AuthLayout
      formTitle='Account setup error'
      showFooterPrompt={false}
      showLogoutButton={false}
    >
      <div className={cn('w-full px-6 py-7 text-center', AUTH_SURFACE.card)}>
        <div className='w-full space-y-5 text-center'>
          <div className='mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-[oklch(65%_0.2_25_/_0.3)] bg-[oklch(65%_0.2_25_/_0.1)]'>
            <XCircle
              className='h-5 w-5 text-[oklch(65%_0.2_25)]'
              aria-hidden='true'
            />
          </div>

          <p className={cn(FORM_LAYOUT.hint, 'mt-0')}>
            We&apos;re having trouble setting up your account. This is usually
            temporary. Our team has been notified and is working to resolve this
            issue. Please try again in a few minutes.
          </p>

          <div className='flex flex-col gap-2 sm:flex-row'>
            <Button asChild className='flex-1'>
              <Link href={APP_ROUTES.DASHBOARD}>Try again</Link>
            </Button>
            <Button asChild variant='secondary' className='flex-1'>
              <a href='mailto:support@jov.ie?subject=Account%20Setup%20Error'>
                Contact support
              </a>
            </Button>
          </div>

          <p className='text-[11px] text-tertiary-token'>
            Error code: USER_CREATION_FAILED
          </p>
        </div>
      </div>
    </AuthLayout>
  );
}
