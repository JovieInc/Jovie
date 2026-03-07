import { LoadingSkeleton } from '@/components/molecules/LoadingSkeleton';

/**
 * Shell-level loading state shown during cross-section navigation
 * (e.g., dashboard -> settings, chat -> admin).
 *
 * Renders a minimal content skeleton that avoids layout shift while the
 * destination page and its data resolve. The shell (sidebar, header) persists
 * because they live in the parent layout — only the content area is replaced.
 */
export default function ShellLoading() {
  return (
    <div className='space-y-6' aria-busy='true' aria-live='polite'>
      <LoadingSkeleton height='h-6' width='w-48' rounded='md' />
      <div className='space-y-4'>
        <LoadingSkeleton height='h-4' width='w-full' rounded='sm' />
        <LoadingSkeleton height='h-4' width='w-3/4' rounded='sm' />
        <LoadingSkeleton height='h-4' width='w-1/2' rounded='sm' />
      </div>
    </div>
  );
}
