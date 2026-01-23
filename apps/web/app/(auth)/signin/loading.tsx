import { AuthFormSkeleton } from '@/components/molecules/LoadingSkeleton';

/**
 * Loading skeleton for the sign-in page.
 */
export default function SignInLoading() {
  return (
    <div className='flex min-h-screen items-center justify-center p-4'>
      <div className='w-full max-w-md space-y-6'>
        {/* Logo skeleton */}
        <div className='flex justify-center'>
          <div className='h-12 w-12 skeleton rounded-lg' />
        </div>

        {/* Title skeleton */}
        <div className='space-y-2 text-center'>
          <div className='mx-auto h-8 w-48 skeleton rounded-md' />
          <div className='mx-auto h-4 w-64 skeleton rounded-md' />
        </div>

        {/* Form skeleton */}
        <AuthFormSkeleton />

        {/* Footer link skeleton */}
        <div className='mx-auto h-4 w-40 skeleton rounded-md' />
      </div>
    </div>
  );
}
