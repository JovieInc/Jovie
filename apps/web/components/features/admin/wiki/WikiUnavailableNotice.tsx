export function WikiUnavailableNotice() {
  return (
    <div className='mt-12 text-center'>
      <p className='text-lg text-tertiary-token'>Wiki source not configured.</p>
      <p className='mt-2 text-sm text-tertiary-token'>
        Set <code className='rounded bg-surface-1 px-1'>GBRAIN_API_KEY</code> to
        enable the company wiki.
      </p>
    </div>
  );
}
