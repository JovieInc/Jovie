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
    <div className='public-doc-support-block mt-8 pt-6'>
      <p className='public-doc-label mb-2'>{title}</p>
      <p className='text-sm text-neutral-600 dark:text-neutral-400'>
        {description}
      </p>
      <Link
        href={`mailto:${email}`}
        className='public-doc-link mt-3 inline-block text-sm font-medium'
      >
        {email}
      </Link>
    </div>
  );
}
