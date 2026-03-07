import { PageContent, PageShell } from '@/components/organisms/PageShell';

const SKELETON_ROW_KEYS = Array.from(
  { length: 6 },
  (_, i) => `ingest-row-${i + 1}`
);

export default function AdminIngestLoading() {
  return (
    <PageShell>
      <PageContent>
        <div className='space-y-6' aria-busy='true'>
          <div className='rounded-xl border border-subtle bg-surface-1/80 px-6 py-5'>
            <div className='h-5 w-44 rounded skeleton' />
            <div className='mt-2 h-3 w-64 rounded skeleton' />
          </div>
          <div className='rounded-xl border border-subtle bg-surface-1/80 px-6 py-5'>
            <div className='h-5 w-36 rounded skeleton' />
          </div>
          <div className='rounded-xl border border-subtle bg-surface-1/80 px-6 py-5'>
            <div className='h-5 w-40 rounded skeleton' />
            <div className='mt-4 space-y-3'>
              {SKELETON_ROW_KEYS.map(key => (
                <div key={key} className='flex items-center gap-3'>
                  <div className='size-4 rounded skeleton' />
                  <div className='h-4 w-20 rounded skeleton' />
                  <div className='h-4 w-32 rounded skeleton' />
                  <div className='ml-auto h-3 w-12 rounded skeleton' />
                </div>
              ))}
            </div>
          </div>
        </div>
      </PageContent>
    </PageShell>
  );
}
