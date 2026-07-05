export function WikiUnavailableNotice() {
  return (
    <div className='mt-12 text-center'>
      <p className='text-lg text-gray-500 dark:text-gray-400'>
        Wiki source not configured.
      </p>
      <p className='mt-2 text-sm text-gray-400 dark:text-gray-500'>
        Set{' '}
        <code className='rounded bg-gray-100 px-1 dark:bg-gray-800'>
          GBRAIN_API_KEY
        </code>{' '}
        to enable the company wiki.
      </p>
    </div>
  );
}
