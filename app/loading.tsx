export default function Loading() {
  return (
    <div className='min-h-dvh grid place-items-center bg-[#101012] text-white'>
      <div className='flex items-center gap-3'>
        <span className='size-2 rounded-full animate-ping bg-current' />
        <span className='text-sm tracking-wide'>Loading…</span>
      </div>
    </div>
  );
}
// Trigger CI
