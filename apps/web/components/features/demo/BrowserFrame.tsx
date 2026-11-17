/** Decorative browser chrome wrapper for product screenshots. */
export function BrowserFrame({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  return (
    <div className='overflow-hidden rounded-xl border border-on-media/10 bg-on-media/5'>
      {/* Title bar */}
      <div className='flex h-8 items-center gap-1.5 border-b border-on-media/5 bg-on-media/3 px-3'>
        <span className='size-2.5 rounded-full bg-on-media/20' />
        <span className='size-2.5 rounded-full bg-on-media/20' />
        <span className='size-2.5 rounded-full bg-on-media/20' />
      </div>
      {children}
    </div>
  );
}
