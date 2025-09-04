import { useUser } from '@clerk/nextjs';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';

export function AuthActions() {
  const { isSignedIn } = useUser();
  // Feature flags not used here currently

  if (isSignedIn) {
    return (
      <Link
        href='/dashboard'
        className='text-sm px-2.5 py-1 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 dark:focus-visible:ring-gray-500 rounded-sm'
      >
        Dashboard
      </Link>
    );
  }

  return (
    <div className='flex items-center space-x-4'>
      <Link
        href='/signin'
        className='text-sm px-2.5 py-1 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 dark:focus-visible:ring-gray-500 rounded-sm'
      >
        Sign in
      </Link>
      <Button as={Link} href='/signup' variant='primary' size='xs'>
        Sign up
      </Button>
    </div>
  );
}
