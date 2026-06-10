import Link from 'next/link';
import { PublicPageShell } from '@/components/site/PublicPageShell';

export default function LibraryShareDropNotFound() {
  return (
    <PublicPageShell headerVariant='landing' logoSize='xs'>
      <div className='mx-auto max-w-lg px-4 py-24 text-center'>
        <h1 className='text-2xl font-semibold text-primary-token'>
          Drop not found
        </h1>
        <p className='mt-3 text-sm text-secondary-token'>
          This share link may have expired or been revoked.
        </p>
        <Link
          href='/'
          className='mt-6 inline-flex rounded-full border border-subtle px-4 py-2 text-sm font-medium text-primary-token'
        >
          Back to Jovie
        </Link>
      </div>
    </PublicPageShell>
  );
}
