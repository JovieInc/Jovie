const releases = [
  { title: 'Midnight Drive', type: 'Single', color: '#6366f1' },
  { title: 'Echoes', type: 'EP', color: '#f59e0b' },
  { title: 'Into the Blue', type: 'Single', color: '#10b981' },
];

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

      {/* Release rows */}
      <div className='flex flex-col gap-2'>
        {releases.map(release => (
          <div
            key={release.title}
            className='flex items-center gap-3 rounded-lg px-3 py-2'
            style={{ backgroundColor: 'rgba(255, 255, 255, 0.02)' }}
          >
            <div
              className='h-9 w-9 shrink-0 rounded'
              style={{ backgroundColor: release.color }}
            />
            <div className='min-w-0'>
              <p
                className='truncate text-xs font-medium'
                style={{ color: 'rgb(247, 248, 248)' }}
              >
                {release.title}
              </p>
              <p
                className='text-[10px]'
                style={{ color: 'rgba(255, 255, 255, 0.4)' }}
              >
                {release.type}
              </p>
            </div>
          </div>
        ))}
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
