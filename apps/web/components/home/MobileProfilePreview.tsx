export function MobileProfilePreview() {
  return (
    <div className='flex h-full flex-col px-5 pb-6 pt-10'>
      {/* Avatar + name */}
      <div className='mb-5 flex flex-col items-center'>
        <div
          className='mb-3 flex h-16 w-16 items-center justify-center rounded-full text-lg font-semibold'
          style={{
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            color: 'rgb(247, 248, 248)',
          }}
        >
          T
        </div>
        <p
          className='text-sm font-medium'
          style={{ color: 'rgb(247, 248, 248)' }}
        >
          Tim White
        </p>
        <p
          className='mt-0.5 text-xs'
          style={{ color: 'rgba(255, 255, 255, 0.5)' }}
        >
          Indie / Alternative
        </p>
      </div>

      {/* CTA */}
      <div className='mt-auto pt-5'>
        <div
          className='w-full rounded-lg py-2.5 text-center text-xs font-medium'
          style={{
            backgroundColor: 'rgb(247, 248, 248)',
            color: 'rgb(8, 9, 10)',
          }}
        >
          Get updates from Tim
        </div>
      </div>
    </div>
  );
}
