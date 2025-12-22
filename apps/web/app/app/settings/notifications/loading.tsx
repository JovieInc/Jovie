export default function SettingsNotificationsLoading() {
  return (
    <div className='mx-auto max-w-2xl'>
      <div className='space-y-8 pb-8'>
        <section className='scroll-mt-4'>
          <div className='mb-6 space-y-2'>
            <div className='h-8 w-56 rounded skeleton' />
            <div className='h-4 w-96 rounded skeleton' />
          </div>
          <div className='rounded-2xl bg-surface-1/40 p-6 shadow-none space-y-4'>
            <div className='flex items-center justify-between gap-4'>
              <div className='h-4 w-56 rounded skeleton' />
              <div className='h-6 w-10 rounded skeleton' />
            </div>
            <div className='flex items-center justify-between gap-4'>
              <div className='h-4 w-64 rounded skeleton' />
              <div className='h-6 w-10 rounded skeleton' />
            </div>
            <div className='flex items-center justify-between gap-4'>
              <div className='h-4 w-48 rounded skeleton' />
              <div className='h-6 w-10 rounded skeleton' />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
