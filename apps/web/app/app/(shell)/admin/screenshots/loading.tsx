const SKELETON_KEYS = Array.from({ length: 8 }, (_, i) => `ss-loading-${i}`);

/**
 * Screenshots loading screen — matches gallery grid layout.
 */
export default function ScreenshotsLoading() {
  return (
    <>
      <header className='mb-6'>
        <div className='h-5 w-28 rounded skeleton' />
        <div className='mt-1 h-3 w-44 rounded skeleton' />
      </header>
      <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'>
        {SKELETON_KEYS.map(key => (
          <div key={key} className='space-y-2'>
            <div className='aspect-video w-full rounded-lg skeleton' />
            <div className='h-4 w-3/4 skeleton' />
            <div className='h-8 w-24 rounded-md skeleton' />
          </div>
        ))}
      </div>
    </>
  );
}
