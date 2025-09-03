export default function Loading() {
  return (
    <div className='min-h-dvh grid place-items-center bg-[rgb(10,10,11)] text-[rgb(235,235,235)] dark:bg-black dark:text-white'>
      <div className='flex items-center gap-3'>
        <span className='size-2 rounded-full animate-ping bg-current' />
        <span className='text-sm tracking-wide'>Loading…</span>
      </div>
    </div>
  );
}
