import Link from 'next/link';

interface WaitlistInviteMessageProps {
  readonly title: string;
  readonly body: string;
}

export function WaitlistInviteMessage({
  title,
  body,
}: WaitlistInviteMessageProps) {
  return (
    <main className='mx-auto flex min-h-screen w-full max-w-lg flex-col justify-center px-6 py-16'>
      <div className='space-y-4'>
        <h1 className='text-title font-semibold tracking-normal text-primary-token'>
          {title}
        </h1>
        <p className='text-base leading-7 text-secondary-token'>{body}</p>
        <Link
          href='/waitlist'
          className='inline-flex rounded-md border border-subtle px-3 py-2 text-sm font-medium text-primary-token outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent'
        >
          Check waitlist status
        </Link>
      </div>
    </main>
  );
}
