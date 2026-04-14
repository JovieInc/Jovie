import Link from 'next/link';
import { HOMEPAGE_PROFILE_SHOWCASE_STATES } from '@/features/home/homepage-profile-preview-fixture';

const states = Object.keys(HOMEPAGE_PROFILE_SHOWCASE_STATES);

export default function RendersIndexPage() {
  return (
    <div className='mx-auto max-w-2xl px-6 py-24'>
      <h1 className='text-2xl font-semibold text-primary-token'>
        Marketing Renders
      </h1>
      <p className='mt-2 text-sm text-secondary-token'>
        Real profile components rendered with curated demo data. Use these for
        landing page screenshots.
      </p>
      <p className='mt-1 text-xs text-quaternary-token'>
        Add <code>?chrome=true</code> to show Jovie branding and menu. Add{' '}
        <code>?width=375</code> to change render width.
      </p>

      <div className='mt-8 grid gap-2'>
        {states.map(state => (
          <Link
            key={state}
            href={`/renders/${state}`}
            className='rounded-lg border border-white/8 bg-white/3 px-4 py-3 text-sm text-primary-token transition-colors hover:bg-white/6'
          >
            {state}
          </Link>
        ))}
      </div>
    </div>
  );
}
