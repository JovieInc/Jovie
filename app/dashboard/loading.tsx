/**
 * Dashboard loading skeleton
 * Renders the sidebar + main area shell to prevent layout shift while data loads.
 */
export default function DashboardLoading() {
  return (
    <div className='flex min-h-screen bg-base'>
      {/* Sidebar skeleton */}
      <aside className='hidden md:flex w-64 shrink-0 flex-col border-r border-subtle bg-surface-0 p-4 space-y-4'>
        {/* Logo placeholder */}
        <div className='h-8 w-24 rounded skeleton' />
        {/* Nav items */}
        <div className='space-y-2 pt-4'>
          {[...Array(5)].map((_, i) => (
            <div key={i} className='h-9 w-full rounded-md skeleton' />
          ))}
        </div>
        {/* User button placeholder */}
        <div className='mt-auto h-12 w-full rounded-lg skeleton' />
      </aside>

      {/* Main content skeleton */}
      <main className='flex-1 p-6 space-y-6'>
        {/* Header */}
        <div className='h-8 w-48 rounded skeleton' />
        {/* Cards */}
        <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3'>
          {[...Array(3)].map((_, i) => (
            <div key={i} className='h-32 rounded-xl skeleton' />
          ))}
        </div>
        {/* Content area */}
        <div className='h-64 rounded-xl skeleton' />
      </main>
    </div>
  );
}
