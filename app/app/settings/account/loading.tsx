export default function SettingsAccountLoading() {
  return (
    <div className='mx-auto max-w-2xl'>
      <div className='space-y-8 pb-8'>
        <section className='scroll-mt-4'>
          <div className='mb-6 space-y-2'>
            <div className='h-8 w-56 rounded skeleton' />
            <div className='h-4 w-96 rounded skeleton' />
          </div>
          <div className='rounded-2xl bg-surface-1/40 p-6 shadow-none space-y-4'>
            <div className='h-10 w-full rounded skeleton' />
            <div className='h-10 w-full rounded skeleton' />
            <div className='h-10 w-40 rounded skeleton' />
          </div>
        </section>
      </div>
    </div>
  );
}
