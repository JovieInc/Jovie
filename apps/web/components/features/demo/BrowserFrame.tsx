/** Decorative browser chrome wrapper for product screenshots. */
export function BrowserFrame({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  return (
    <div className='overflow-hidden rounded-xl border border-white/10 bg-white/5'>
      {/* Title bar */}
      <div className='flex h-8 items-center gap-1.5 border-b border-white/5 bg-white/[0.03] px-3'>
        <span className='size-2.5 rounded-full bg-white/20' />
        <span className='size-2.5 rounded-full bg-white/20' />
        <span className='size-2.5 rounded-full bg-white/20' />
      </div>
      {children}
    </div>
  );
}
