import { Skeleton } from '@jovie/ui';

const LEGAL_SKELETON_SECTIONS = [
  'scope',
  'data',
  'rights',
  'controls',
  'updates',
] as const;

export default function LegalLoading() {
  return (
    <div
      className='space-y-10'
      role='status'
      aria-busy='true'
      aria-live='polite'
      aria-label='Loading Legal Document'
      data-testid='legal-loading'
    >
      <div
        className='flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between'
        aria-hidden='true'
      >
        <div className='w-full max-w-3xl border-b border-subtle pb-8'>
          <Skeleton className='h-10 w-56' rounded='md' />
          <Skeleton className='mt-3 h-4 w-44' rounded='md' />
          <div className='mt-6 space-y-2'>
            <Skeleton className='h-4 w-full max-w-xl' rounded='md' />
            <Skeleton className='mt-2 h-4 w-4/5 max-w-lg' rounded='md' />
          </div>
        </div>
        <Skeleton className='h-9 w-44' rounded='lg' />
      </div>
      <div className='border-y border-subtle py-5 lg:hidden' aria-hidden='true'>
        <Skeleton className='h-4 w-24' rounded='md' />
        <div className='mt-4 space-y-2'>
          <Skeleton className='h-4 w-48' rounded='md' />
          <Skeleton className='h-4 w-40' rounded='md' />
        </div>
      </div>
      <div
        className='grid min-w-0 gap-12 lg:grid-cols-[220px_minmax(0,760px)] xl:grid-cols-[240px_minmax(0,800px)]'
        aria-hidden='true'
      >
        <aside className='max-lg:hidden'>
          <Skeleton className='h-4 w-24' rounded='md' />
          <div className='mt-4 space-y-2'>
            <Skeleton className='h-4 w-44' rounded='md' />
            <Skeleton className='h-4 w-36' rounded='md' />
            <Skeleton className='h-4 w-40' rounded='md' />
          </div>
        </aside>
        <div className='min-w-0 space-y-8'>
          {LEGAL_SKELETON_SECTIONS.map(section => (
            <div key={section} className='space-y-3'>
              <Skeleton className='h-7 w-52' rounded='md' />
              <Skeleton className='h-4 w-full' rounded='md' />
              <Skeleton className='h-4 w-11/12' rounded='md' />
              <Skeleton className='h-4 w-4/5' rounded='md' />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
