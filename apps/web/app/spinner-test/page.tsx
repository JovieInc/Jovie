'use client';

export default function SpinnerTestPage() {
  return (
    <div className='min-h-screen flex flex-col items-center justify-center bg-[#101012] gap-8'>
      <h1 className='text-lg font-medium text-[rgb(227,228,230)]'>
        Spinner Test
      </h1>

      {/* SVG Spinner */}
      <svg
        width='64'
        height='64'
        viewBox='0 0 44 44'
        xmlns='http://www.w3.org/2000/svg'
        aria-hidden='true'
      >
        <style>
          {`
                    .spinner {
                      transform-origin: 50% 50%;
                      animation: spin 1s linear infinite;
                    }

                    @keyframes spin {
                      to {
                        transform: rotate(360deg);
                      }
                    }
                  `}
        </style>

        <defs>
          <linearGradient
            id='spinnerTail'
            x1='22'
            y1='2'
            x2='22'
            y2='42'
            gradientUnits='userSpaceOnUse'
            gradientTransform='rotate(-40 22 22)'
          >
            <stop offset='0%' stopColor='white' stopOpacity='1' />
            <stop offset='70%' stopColor='white' stopOpacity='1' />
            <stop offset='100%' stopColor='white' stopOpacity='0' />
          </linearGradient>
        </defs>

        <g className='spinner'>
          <circle
            cx='22'
            cy='22'
            r='14'
            fill='none'
            stroke='url(#spinnerTail)'
            strokeWidth='8'
            strokeLinecap='round'
            strokeDasharray='80 16'
          />
        </g>
      </svg>

      <p className='text-sm text-[#6b6f76]'>View at /spinner-test</p>
    </div>
  );
}
