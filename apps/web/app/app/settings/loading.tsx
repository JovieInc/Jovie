import { LoadingSkeleton } from '@/components/molecules/LoadingSkeleton';

export default function SettingsLoading() {
  return (
    <div className='w-full bg-base'>
      <main className='container mx-auto max-w-7xl p-6 space-y-8'>
        <div className='space-y-2'>
          <LoadingSkeleton height='h-8' width='w-56' rounded='md' />
          <LoadingSkeleton height='h-4' width='w-2/3' rounded='sm' />
        </div>

        <div className='rounded-xl border border-subtle bg-surface-1 p-6'>
          <div className='space-y-4'>
            <LoadingSkeleton height='h-4' width='w-1/3' />
            <LoadingSkeleton height='h-10' />
            <LoadingSkeleton height='h-10' />
            <LoadingSkeleton height='h-10' />
          </div>
        </div>
      </main>
    </div>
  );
}
