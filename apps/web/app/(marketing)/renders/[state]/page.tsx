import { Suspense } from 'react';
import { HOMEPAGE_PROFILE_SHOWCASE_STATES } from '@/features/home/homepage-profile-preview-fixture';
import type { ProfileShowcaseStateId } from '@/features/profile/contracts';
import { MarketingStateRenderClient } from './MarketingStateRenderClient';

export const revalidate = false;
export const dynamicParams = false;

const VALID_STATES = Object.keys(
  HOMEPAGE_PROFILE_SHOWCASE_STATES
) as ProfileShowcaseStateId[];

export function generateStaticParams() {
  return VALID_STATES.map(state => ({ state }));
}

export default async function MarketingRenderPage({
  params,
}: {
  readonly params: Promise<{ state: string }>;
}) {
  const { state } = await params;
  const stateId = state as ProfileShowcaseStateId;

  if (!VALID_STATES.includes(stateId)) {
    return (
      <div className='flex min-h-screen items-center justify-center bg-black text-white'>
        <div className='text-center'>
          <h1 className='text-2xl font-semibold'>Unknown state: {stateId}</h1>
          <p className='mt-4 text-white/60'>Available states:</p>
          <ul className='mt-2 space-y-1 text-sm text-white/40'>
            {VALID_STATES.map(s => (
              <li key={s}>
                <a href={`/renders/${s}`} className='hover:text-white/80'>
                  {s}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  return (
    <div
      className='flex min-h-screen items-center justify-center bg-black'
      style={{ padding: '2rem' }}
    >
      <Suspense fallback={null}>
        <MarketingStateRenderClient stateId={stateId} />
      </Suspense>
    </div>
  );
}
