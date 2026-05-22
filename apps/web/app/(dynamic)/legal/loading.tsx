const LEGAL_SKELETON_SECTIONS = [
  'scope',
  'data',
  'rights',
  'controls',
  'updates',
] as const;

export default function LegalLoading() {
  return (
    <div className='space-y-10'>
      <div className='flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between'>
        <div className='w-full max-w-3xl border-b border-neutral-200 pb-8 dark:border-white/10'>
          <div className='h-10 w-56 skeleton rounded-md' />
          <div className='mt-3 h-4 w-44 skeleton rounded-md' />
          <div className='mt-7 border-l border-neutral-300 pl-4 dark:border-white/15'>
            <div className='h-4 w-36 skeleton rounded-md' />
            <div className='mt-3 h-4 w-full max-w-xl skeleton rounded-md' />
            <div className='mt-2 h-4 w-4/5 max-w-lg skeleton rounded-md' />
          </div>
        </div>
        <div className='h-9 w-44 skeleton rounded-lg' />
      </div>
      <div className='border-y border-neutral-200 py-5 dark:border-white/10 lg:hidden'>
        <div className='h-4 w-24 skeleton rounded-md' />
        <div className='mt-4 space-y-2'>
          <div className='h-4 w-48 skeleton rounded-md' />
          <div className='h-4 w-40 skeleton rounded-md' />
        </div>
      </div>
      <div className='grid min-w-0 gap-12 lg:grid-cols-[220px_minmax(0,760px)] xl:grid-cols-[240px_minmax(0,800px)]'>
        <aside className='max-lg:hidden'>
          <div className='h-4 w-24 skeleton rounded-md' />
          <div className='mt-4 space-y-2'>
            <div className='h-4 w-44 skeleton rounded-md' />
            <div className='h-4 w-36 skeleton rounded-md' />
            <div className='h-4 w-40 skeleton rounded-md' />
          </div>
        </aside>
        <div className='min-w-0 space-y-8'>
          {LEGAL_SKELETON_SECTIONS.map(section => (
            <div key={section} className='space-y-3'>
              <div className='h-7 w-52 skeleton rounded-md' />
              <div className='h-4 w-full skeleton rounded-md' />
              <div className='h-4 w-11/12 skeleton rounded-md' />
              <div className='h-4 w-4/5 skeleton rounded-md' />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
