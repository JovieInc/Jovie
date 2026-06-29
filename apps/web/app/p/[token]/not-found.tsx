import Link from 'next/link';

export default function LibraryAssetPrivateShareNotFound() {
  return (
    <main className='mx-auto flex min-h-[50vh] w-full max-w-lg flex-col items-center justify-center gap-3 px-4 text-center'>
      <h1 className='text-xl font-semibold text-primary-token'>
        This Share Link Is Unavailable
      </h1>
      <p className='text-sm text-secondary-token'>
        The link may have expired, been revoked, or never existed.
      </p>
      <Link href='/' className='text-sm text-secondary-token underline'>
        Go to Jovie
      </Link>
    </main>
  );
}
