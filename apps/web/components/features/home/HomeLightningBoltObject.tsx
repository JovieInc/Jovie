export function HomeLightningBoltObject() {
  return (
    <div className='homepage-lightning-object' aria-hidden='true'>
      <svg
        aria-hidden='true'
        viewBox='0 0 64 96'
        fill='none'
        className='homepage-lightning-bolt'
      >
        <path
          d='M38 2L8 42h20L22 94l36-52H38L44 2H38Z'
          fill='url(#bolt-fill)'
          stroke='url(#bolt-stroke)'
          strokeWidth='1.5'
          strokeLinejoin='round'
        />
        <defs>
          <linearGradient
            id='bolt-fill'
            x1='32'
            y1='2'
            x2='32'
            y2='94'
            gradientUnits='userSpaceOnUse'
          >
            <stop stopColor='rgba(167, 215, 255, 0.92)' />
            <stop offset='1' stopColor='rgba(90, 168, 255, 0.72)' />
          </linearGradient>
          <linearGradient
            id='bolt-stroke'
            x1='32'
            y1='2'
            x2='32'
            y2='94'
            gradientUnits='userSpaceOnUse'
          >
            <stop stopColor='rgba(200, 230, 255, 0.6)' />
            <stop offset='1' stopColor='rgba(120, 180, 255, 0.3)' />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}
