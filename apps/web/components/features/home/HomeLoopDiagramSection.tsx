/**
 * Home — "Stop letting momentum decay." (the Jovie Loop).
 *
 * Source: Claude Design home-page-hero bundle, SectionDecay.jsx.
 * Server component, fully static. Accent: Geist purple.
 */

const LOOP_LABELS = [
  { angle: -90, label: 'Release' },
  { angle: -30, label: 'Capture' },
  { angle: 30, label: 'Route' },
  { angle: 150, label: 'Learn' },
  { angle: 210, label: 'Next action' },
] as const;

const FLATLINE_ITEMS = [
  'One-off campaigns',
  'Manual follow-up',
  'Stale links',
  'Forgotten fans',
  'Cold starts',
  'Momentum decay',
] as const;

const LOOP_ITEMS = [
  'Signals captured',
  'Fans routed',
  'CTAs updated',
  'Messages queued',
  'Cities detected',
  'Momentum recycled',
] as const;

const ACCENT = 'var(--geist-purple-solid)';
const ACCENT_DASH =
  'color-mix(in srgb, var(--geist-purple-solid) 40%, transparent)';

const SIZE = 220;
const CX = SIZE / 2;
const CY = 90;

function loopPoint(angleDeg: number, radius: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: CX + Math.cos(rad) * radius, y: CY + Math.sin(rad) * radius };
}

export function HomeLoopDiagramSection() {
  return (
    <section className='border-t border-white/[0.04] bg-black px-6 py-32 sm:py-40'>
      <div className='mx-auto grid max-w-[1200px] gap-16 lg:grid-cols-[320px_1fr] lg:items-center'>
        <div>
          <h2 className='m-0 font-[var(--marketing-font-display)] text-[clamp(2rem,4.5vw,3rem)] font-extrabold leading-[1.05] tracking-[-0.03em] text-[#F7F8F8]'>
            Stop letting
            <br />
            momentum decay.
          </h2>
          <p className='mt-5 mb-7 max-w-[32ch] font-[var(--marketing-font-body)] text-base leading-[1.5] text-[#A2A7AF]'>
            Jovie shortens the time between fan signal and next action.
          </p>
        </div>

        <div className='grid items-center gap-4 sm:grid-cols-[1fr_auto_1fr]'>
          {/* Flatline card */}
          <article className='min-h-[360px] rounded-xl border border-white/[0.06] bg-[#0a0a0b] p-5'>
            <div className='font-[var(--marketing-font-body)] text-[10px] font-semibold uppercase tracking-[0.12em] text-[#8A8F98]'>
              Flatline marketing
            </div>
            <svg
              viewBox='0 0 220 80'
              preserveAspectRatio='none'
              className='mt-2 h-20 w-full'
              role='img'
              aria-label='Three sharp spikes that fall back to a flat line, illustrating one-off campaigns'
            >
              <line
                x1='0'
                y1='65'
                x2='220'
                y2='65'
                stroke='rgba(255,255,255,0.08)'
              />
              {[0, 1, 2].map(i => (
                <path
                  key={i}
                  d={`M${20 + i * 70},65 L${30 + i * 70},20 L${40 + i * 70},65 Z`}
                  stroke='#A2A7AF'
                  strokeWidth='1.4'
                  fill='none'
                />
              ))}
            </svg>
            <ul className='mt-3 list-none space-y-0 p-0'>
              {FLATLINE_ITEMS.map(item => (
                <li
                  key={item}
                  className='flex items-center gap-2 py-[5px] font-[var(--marketing-font-body)] text-xs text-[#A2A7AF]'
                >
                  <span
                    aria-hidden='true'
                    className='inline-block h-[5px] w-[5px] flex-shrink-0 rounded-full bg-[#3a3b3d]'
                  />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </article>

          {/* vs */}
          <div
            aria-hidden='true'
            className='mx-auto flex h-8 w-8 items-center justify-center rounded-full border border-white/10 font-[var(--marketing-font-display)] text-sm font-bold text-[#8A8F98]'
          >
            vs
          </div>

          {/* Loop card */}
          <article className='min-h-[360px] rounded-xl border border-white/[0.06] bg-[#0a0a0b] p-5'>
            <div
              className='font-[var(--marketing-font-body)] text-[10px] font-semibold uppercase tracking-[0.12em]'
              style={{ color: ACCENT }}
            >
              The Jovie Loop
            </div>
            <div className='relative mt-1 h-[180px]'>
              <svg
                width={SIZE}
                height={180}
                viewBox={`0 0 ${SIZE} 180`}
                className='absolute left-1/2 -translate-x-1/2'
                role='img'
                aria-label='Closed loop showing release, capture, route, learn, next action stages connected to a glowing infinity center'
              >
                <circle
                  cx={CX}
                  cy={CY}
                  r='60'
                  stroke={ACCENT_DASH}
                  strokeWidth='1.5'
                  fill='none'
                  strokeDasharray='3 4'
                />
                {LOOP_LABELS.map(({ angle, label }) => {
                  const { x, y } = loopPoint(angle, 78);
                  return (
                    <text
                      key={label}
                      x={x}
                      y={y}
                      fill='#A2A7AF'
                      fontSize='9'
                      textAnchor='middle'
                      dominantBaseline='middle'
                      fontFamily='var(--marketing-font-body)'
                      fontWeight='500'
                    >
                      {label}
                    </text>
                  );
                })}
                <g transform={`translate(${CX - 22} ${CY - 11})`}>
                  <path
                    d='M6 11 C6 5, 14 5, 22 11 C30 17, 38 17, 38 11 C38 5, 30 5, 22 11 C14 17, 6 17, 6 11 Z'
                    stroke={ACCENT}
                    strokeWidth='2'
                    fill='none'
                    style={{ filter: `drop-shadow(0 0 6px ${ACCENT})` }}
                  />
                </g>
                {[-90, -30, 30, 90, 150, 210].map(a => {
                  const { x, y } = loopPoint(a, 55);
                  return (
                    <circle
                      key={a}
                      cx={x}
                      cy={y}
                      r='5'
                      fill='#0f1011'
                      stroke='rgba(255,255,255,0.15)'
                    />
                  );
                })}
              </svg>
            </div>
            <ul className='mt-1 list-none space-y-0 p-0'>
              {LOOP_ITEMS.map(item => (
                <li
                  key={item}
                  className='flex items-center gap-2 py-[5px] font-[var(--marketing-font-body)] text-xs text-[#A2A7AF]'
                >
                  <span
                    aria-hidden='true'
                    className='inline-block h-[5px] w-[5px] flex-shrink-0 rounded-full'
                    style={{ background: ACCENT }}
                  />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </article>
        </div>
      </div>
    </section>
  );
}
