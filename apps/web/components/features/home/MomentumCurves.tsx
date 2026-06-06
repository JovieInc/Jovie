export function MomentumCurve() {
  return (
    <svg
      viewBox='0 0 400 120'
      className='system-b-home-bento-curve'
      aria-hidden='true'
    >
      <line
        x1='0'
        y1='119'
        x2='400'
        y2='119'
        className='system-b-home-bento-curve-axis'
        strokeWidth='1'
      />
      <path
        d='M 0 105 C 80 102, 160 98, 220 92 S 300 70, 340 40 S 370 12, 400 4'
        fill='none'
        className='system-b-home-bento-curve-line'
        strokeWidth='2'
      />
      {[
        { x: 80, y: 103, label: 'Release 1' },
        { x: 180, y: 96, label: 'Release 2' },
        { x: 290, y: 72, label: 'Release 3' },
        { x: 370, y: 16, label: 'Release 4' },
      ].map(dot => (
        <g key={dot.label}>
          <circle
            cx={dot.x}
            cy={dot.y}
            r='4'
            className='system-b-home-bento-curve-node'
          />
          <circle
            cx={dot.x}
            cy={dot.y}
            r='8'
            className='system-b-home-bento-curve-node-halo'
          />
        </g>
      ))}
    </svg>
  );
}

export function FlatlineCurve() {
  return (
    <svg
      viewBox='0 0 400 120'
      className='system-b-home-bento-curve'
      aria-hidden='true'
    >
      <line
        x1='0'
        y1='119'
        x2='400'
        y2='119'
        className='system-b-home-bento-curve-axis'
        strokeWidth='1'
      />
      <path
        d='M 0 70 Q 30 65, 60 72 T 120 68 T 180 74 T 240 70 T 300 73 T 360 69 T 400 72'
        fill='none'
        className='system-b-home-bento-curve-flatline'
        strokeWidth='1.5'
        strokeDasharray='4 3'
      />
      {[60, 140, 230, 320].map(x => (
        <circle
          key={x}
          cx={x}
          cy={70 + (x % 3) * 2 - 2}
          r='3'
          className='system-b-home-bento-curve-flatline-node'
        />
      ))}
    </svg>
  );
}
