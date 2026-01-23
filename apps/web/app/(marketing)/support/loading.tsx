/**
 * Support page loading skeleton
 */
export default function SupportLoading() {
  return (
    <div className='min-h-screen bg-white dark:bg-[#0D0E12]'>
      <section className='relative flex min-h-[60vh] flex-col items-center justify-center px-4 py-20 text-center'>
        {/* Title skeleton */}
        <div className='h-12 w-64 skeleton rounded-lg mb-4' />
        {/* Subtitle skeleton */}
        <div className='h-6 w-96 max-w-full skeleton rounded-md mb-8' />
        {/* Contact options skeleton */}
        <div className='grid md:grid-cols-2 gap-6 max-w-2xl w-full'>
          <div className='h-32 skeleton rounded-xl' />
          <div className='h-32 skeleton rounded-xl' />
        </div>
      </section>
    </div>
  );
}
