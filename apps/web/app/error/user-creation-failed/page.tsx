import { auth } from '@clerk/nextjs/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';

export const runtime = 'nodejs';

export default async function UserCreationFailedPage() {
  const { userId } = await auth();

  // If somehow resolved, redirect to dashboard
  if (!userId) {
    redirect('/signin');
  }

  return (
    <div className='flex min-h-screen items-center justify-center p-4'>
      <div className='max-w-md space-y-6 text-center'>
        <div className='space-y-2'>
          <h1 className='text-2xl font-bold'>Account Setup Error</h1>
          <p className='text-muted-foreground'>
            We're having trouble setting up your account. This is usually
            temporary.
          </p>
        </div>

        <div className='space-y-4'>
          <p className='text-sm text-muted-foreground'>
            Our team has been notified and is working to resolve this issue.
            Please try again in a few minutes.
          </p>

          <div className='flex flex-col gap-2'>
            <Link
              href='/app/dashboard'
              className='inline-flex h-10 items-center justify-center rounded-md bg-primary px-8 py-2 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50'
            >
              Try Again
            </Link>

            <a
              href='mailto:support@jov.ie?subject=Account%20Setup%20Error'
              className='inline-flex h-10 items-center justify-center rounded-md border border-input bg-background px-8 py-2 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50'
            >
              Contact Support
            </a>
          </div>
        </div>

        <p className='text-xs text-muted-foreground'>
          Error Code: USER_CREATION_FAILED
        </p>
      </div>
    </div>
  );
}
