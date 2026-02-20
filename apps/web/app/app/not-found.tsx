/**
 * App-shell 404 — renders inside the dashboard layout.
 * Matches Linear's centered "Not found" pattern with a Jovie-themed illustration.
 */
export default function AppNotFound() {
  return (
    <div className='flex flex-1 items-center justify-center p-6'>
      <div className='flex flex-col items-center text-center'>
        {/* Illustration — broken vinyl / missing track, Jovie-themed */}
        <div className='mb-5 flex h-[72px] w-[72px] items-center justify-center rounded-2xl bg-surface-2'>
          <svg
            width='36'
            height='36'
            viewBox='0 0 36 36'
            fill='none'
            xmlns='http://www.w3.org/2000/svg'
            aria-hidden='true'
            className='text-tertiary-token'
          >
            {/* Dotted grid background */}
            {[0, 1, 2, 3, 4].map(row =>
              [0, 1, 2, 3, 4].map(col => (
                <circle
                  key={`${row}-${col}`}
                  cx={6 + col * 6}
                  cy={6 + row * 6}
                  r='1'
                  fill='currentColor'
                  opacity='0.25'
                />
              ))
            )}
            {/* X mark */}
            <line
              x1='12'
              y1='12'
              x2='24'
              y2='24'
              stroke='currentColor'
              strokeWidth='2'
              strokeLinecap='round'
              opacity='0.7'
            />
            <line
              x1='24'
              y1='12'
              x2='12'
              y2='24'
              stroke='currentColor'
              strokeWidth='2'
              strokeLinecap='round'
              opacity='0.7'
            />
          </svg>
        </div>

        <h1 className='text-sm font-medium text-primary-token mb-1'>
          Not found
        </h1>
        <p className='text-[13px] text-tertiary-token'>
          We could not find the page you were looking for
        </p>
      </div>
    </div>
  );
}
