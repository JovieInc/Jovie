import { LoadingSkeleton } from '@jovie/ui';
import { MarketingContentShell } from '@/components/marketing/MarketingContentShell';

const LEGAL_SKELETON_SECTIONS = [
  'scope',
  'data',
  'rights',
  'controls',
  'updates',
] as const;

export function LegalLoadingContent() {
  return (
    <div
      className='space-y-10'
      role='status'
      aria-busy='true'
      aria-live='polite'
      aria-label='Loading Legal Document'
      data-testid='legal-loading'
    >
      <div className='flex flex-col gap-6' aria-hidden='true'>
        <div className='w-full max-w-3xl border-b border-subtle pb-8'>
          <LoadingSkeleton
            announce={false}
            height='h-10'
            width='w-56'
            rounded='md'
          />
          <LoadingSkeleton
            announce={false}
            className='mt-3'
            height='h-4'
            width='w-44'
            rounded='md'
          />
          <div className='mt-6 space-y-2'>
            <LoadingSkeleton
              announce={false}
              height='h-4'
              width='w-full max-w-xl'
              rounded='md'
            />
            <LoadingSkeleton
              announce={false}
              className='mt-2'
              height='h-4'
              width='w-4/5 max-w-lg'
              rounded='md'
            />
          </div>
        </div>
        <LoadingSkeleton
          announce={false}
          height='h-9'
          width='w-44'
          rounded='lg'
        />
      </div>
      <div className='border-y border-subtle py-5' aria-hidden='true'>
        <LoadingSkeleton
          announce={false}
          height='h-4'
          width='w-24'
          rounded='md'
        />
        <div className='mt-4 space-y-2'>
          <LoadingSkeleton
            announce={false}
            height='h-4'
            width='w-48'
            rounded='md'
          />
          <LoadingSkeleton
            announce={false}
            height='h-4'
            width='w-40'
            rounded='md'
          />
        </div>
      </div>
      <div className='min-w-0 space-y-8' aria-hidden='true'>
        <div className='min-w-0 space-y-8'>
          {LEGAL_SKELETON_SECTIONS.map(section => (
            <div key={section} className='space-y-3'>
              <LoadingSkeleton
                announce={false}
                height='h-7'
                width='w-52'
                rounded='md'
              />
              <LoadingSkeleton
                announce={false}
                height='h-4'
                width='w-full'
                rounded='md'
              />
              <LoadingSkeleton
                announce={false}
                height='h-4'
                width='w-11/12'
                rounded='md'
              />
              <LoadingSkeleton
                announce={false}
                height='h-4'
                width='w-4/5'
                rounded='md'
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Segment fallback owns a frame; nested page fallbacks inherit their layout. */
export default function LegalLoading() {
  return (
    <MarketingContentShell>
      <LegalLoadingContent />
    </MarketingContentShell>
  );
}
