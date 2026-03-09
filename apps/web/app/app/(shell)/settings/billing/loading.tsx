export default function SettingsBillingLoading() {
  return (
    <div className='mx-auto max-w-3xl pt-2'>
      <div className='space-y-8 pb-6 sm:pb-8'>
        <section className='scroll-mt-4'>
          {/* Static heading — visible immediately */}
          <div className='mb-6 space-y-2'>
            <h2 className='text-lg font-semibold tracking-tight text-primary-token'>
              Billing &amp; Subscription
            </h2>
            <p className='text-sm text-secondary-token'>
              Subscription, payment methods, and invoices.
            </p>
          </div>

          {/* Skeleton card matching SettingsBillingSection layout */}
          <div className='rounded-2xl bg-surface-1/40 p-6 shadow-none'>
            <div className='flex items-center justify-between'>
              <div className='space-y-2'>
                <div className='h-4 w-80 rounded skeleton' />
              </div>
              <div className='h-9 w-40 rounded skeleton' />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
