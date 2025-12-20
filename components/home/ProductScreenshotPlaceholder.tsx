export function ProductScreenshotPlaceholder() {
  // Placeholder component for product screenshot
  // This can be replaced with a real screenshot later
  return (
    <div className='relative w-full aspect-[4/3] bg-surface-1 border border-subtle rounded-lg overflow-hidden shadow-lg'>
      <div className='absolute inset-0 flex items-center justify-center'>
        <div className='text-center space-y-4 p-8'>
          <div className='w-24 h-24 mx-auto rounded-full bg-surface-2 border-2 border-subtle' />
          <div className='space-y-2'>
            <div className='h-6 w-48 mx-auto bg-surface-2 rounded' />
            <div className='h-4 w-32 mx-auto bg-surface-2 rounded' />
          </div>
          <div className='space-y-3 pt-4'>
            <div className='h-12 w-full max-w-xs mx-auto bg-btn-primary rounded-lg' />
            <div className='h-10 w-full max-w-xs mx-auto bg-surface-2 rounded-lg' />
            <div className='h-10 w-full max-w-xs mx-auto bg-surface-2 rounded-lg' />
          </div>
        </div>
      </div>
    </div>
  );
}

