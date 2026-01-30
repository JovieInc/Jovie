import Link from 'next/link';

export interface LegalSupportBlockProps {
  readonly title?: string;
  readonly description: string;
  readonly email: string;
}

export function LegalSupportBlock({
  title = 'Need help?',
  description,
  email,
}: LegalSupportBlockProps) {
  return (
    <div className='mt-8 pt-6 border-t border-neutral-200 dark:border-neutral-800'>
      <p className='text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-2'>
        {title}
      </p>
      <p className='text-sm text-neutral-600 dark:text-neutral-400'>
        {description}
      </p>
      <Link
        href={`mailto:${email}`}
        className='mt-3 inline-block text-sm font-medium text-neutral-900 dark:text-white hover:underline underline-offset-4'
      >
        {email}
      </Link>
    </div>
  );
}
