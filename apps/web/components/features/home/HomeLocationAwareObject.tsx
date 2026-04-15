export function HomeLocationAwareObject() {
  return (
    <div className='homepage-location-object' aria-hidden='true'>
      <div className='homepage-location-grid' />
      <svg
        aria-hidden='true'
        viewBox='0 0 48 64'
        fill='none'
        className='homepage-location-pin'
      >
        <path
          d='M24 2C13.5 2 5 10.5 5 21c0 14.25 19 39 19 39s19-24.75 19-39C43 10.5 34.5 2 24 2Z'
          fill='url(#pin-fill)'
          stroke='rgba(200, 220, 255, 0.3)'
          strokeWidth='1.2'
        />
        <circle
          cx='24'
          cy='21'
          r='7'
          fill='rgba(8, 10, 14, 0.7)'
          stroke='rgba(200, 220, 255, 0.4)'
          strokeWidth='1'
        />
        <defs>
          <linearGradient
            id='pin-fill'
            x1='24'
            y1='2'
            x2='24'
            y2='60'
            gradientUnits='userSpaceOnUse'
          >
            <stop stopColor='rgba(140, 190, 255, 0.85)' />
            <stop offset='1' stopColor='rgba(80, 140, 255, 0.55)' />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}
