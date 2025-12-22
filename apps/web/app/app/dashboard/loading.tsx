/**
 * Dashboard loading skeleton
 * Renders the sidebar + main area shell to prevent layout shift while data loads.
 */
export default function DashboardLoading() {
  return (
    <div className='w-full bg-base'>
      <main className='container mx-auto max-w-7xl p-6 space-y-6'>
        <div className='h-8 w-48 rounded skeleton' />
        <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3'>
          {[...Array(3)].map((_, i) => (
            <div key={i} className='h-32 rounded-xl skeleton' />
          ))}
        </div>
        <div className='h-64 rounded-xl skeleton' />
      </main>
    </div>
  );
}
