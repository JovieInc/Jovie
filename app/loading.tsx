export default function Loading() {
  return (
    <div className='min-h-dvh grid place-items-center bg-base text-primary-token'>
      <div className='flex items-center gap-3 text-sm tracking-wide'>
        <span className='size-2 rounded-full animate-ping bg-current' />
        <span>Loading…</span>
      </div>
    </div>
  );
}
// Trigger CI
