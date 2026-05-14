import type { Metadata } from 'next';
import Link from 'next/link';
import { APP_NAME, BASE_URL } from '@/constants/app';
import {
  JOVIE_PATH,
  Lockup,
  Mark,
  PALETTE,
  TYPOGRAPHY,
  Wordmark,
} from '@/lib/brand';
import { safeJsonLdStringify } from '@/lib/utils/json-ld';

export const revalidate = false;

const BRAND_PAGE_DESCRIPTION =
  'The Jovie brand kit: mark, wordmark, lockups, color, type, icons, downloads. The link your music deserves, deployed everywhere.';

export const metadata: Metadata = {
  title: `Brand · ${APP_NAME}`,
  description: BRAND_PAGE_DESCRIPTION,
  keywords: [
    'Jovie brand',
    'Jovie logo',
    'Jovie press kit',
    'Jovie brand guidelines',
    'Jovie wordmark',
    'Jovie icon download',
  ],
  openGraph: {
    title: `Brand · ${APP_NAME}`,
    description: BRAND_PAGE_DESCRIPTION,
    url: `${BASE_URL}/brand`,
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: `Brand · ${APP_NAME}`,
    description: BRAND_PAGE_DESCRIPTION,
  },
  alternates: {
    canonical: `${BASE_URL}/brand`,
  },
  robots: { index: true, follow: true },
};

const BRAND_SCHEMA = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name: `Brand · ${APP_NAME}`,
  description: BRAND_PAGE_DESCRIPTION,
  url: `${BASE_URL}/brand`,
  isPartOf: { '@type': 'WebSite', name: APP_NAME, url: BASE_URL },
};

const SECTION_PADDING = 'py-16 md:py-24 lg:py-32';
const SECTION_BORDER = 'border-t border-white/10';
const EYEBROW =
  'text-[12px] font-medium uppercase tracking-[0.08em] text-tertiary-token';
const SECTION_HEAD =
  'font-display text-[clamp(40px,6vw,64px)] font-extrabold tracking-[-0.025em] leading-[1.0]';
const LEDE =
  'mt-5 max-w-[44rem] font-body text-[clamp(16px,1.75vw,20px)] leading-[1.5] text-secondary-token';

const MARK_DOS = [
  { bg: 'bg-black', fg: 'text-[#F5F4F0]', label: 'Cream on ink (default)' },
  { bg: 'bg-[#F5F4F0]', fg: 'text-[#08090a]', label: 'Ink on cream' },
  { bg: 'bg-[#1a1a3a]', fg: 'text-[#F5F4F0]', label: 'Cream on midnight' },
  { bg: 'bg-black', fg: 'text-white', label: 'Pure black + white' },
  { bg: 'bg-[#FF4D5F]', fg: 'text-[#F5F4F0]', label: 'Single-hue surface' },
  { bg: 'bg-[#43B85C]', fg: 'text-[#08090a]', label: 'Pairing for contrast' },
  { bg: 'bg-[#1a1a3a]', fg: 'text-[#F5F4F0]', label: 'Brand purple-black' },
  {
    bg: 'bg-gradient-to-br from-[#3a7bff] to-[#f72585]',
    fg: 'text-[#F5F4F0]',
    label: 'Photo / gradient surface',
  },
] as const;

const MARK_DONTS = [
  { label: "Don't rotate", style: 'rotate(35deg)' as const, kind: 'mark' },
  { label: "Don't stretch", style: 'scaleX(1.5)' as const, kind: 'mark' },
  { label: "Don't outline", kind: 'outline' },
  { label: "Don't add gradient", kind: 'gradient' },
  { label: "Don't drop-shadow", kind: 'shadow' },
  { label: "Don't low-contrast", kind: 'low-contrast' },
  { label: "Don't reshape the dot", kind: 'reshape' },
  { label: "Don't crowd it", kind: 'crowd' },
] as const;

const SIZE_LADDER = [16, 24, 32, 48, 64, 96, 128, 192] as const;
const FAVICON_SIZES = [16, 32, 48, 64, 128] as const;

const TYPE_ROWS = [
  TYPOGRAPHY.display,
  TYPOGRAPHY.h1,
  TYPOGRAPHY.h2,
  TYPOGRAPHY.bodyLg,
  TYPOGRAPHY.body,
  TYPOGRAPHY.ui,
] as const;

const TYPE_SAMPLE_SIZES: Record<string, string> = {
  'Display · Satoshi 800': 'text-[clamp(48px,8vw,120px)]',
  'H1 · Satoshi 700': 'text-[clamp(36px,5vw,64px)]',
  'H2 · Satoshi 700': 'text-[clamp(22px,2.5vw,32px)]',
  'Body LG · DM Sans 400': 'text-[clamp(18px,1.6vw,22px)]',
  'Body · DM Sans 400': 'text-[15px]',
  'Product UI · Inter 450': 'text-[13px]',
};

const DOWNLOADS = [
  {
    fmt: 'SVG',
    label: 'Mark · SVG · Ink',
    file: 'Jovie-Logo-Icon-Black.svg',
    href: '/brand/Jovie-Logo-Icon-Black.svg',
  },
  {
    fmt: 'SVG',
    label: 'Mark · SVG · Cream',
    file: 'Jovie-Logo-Icon-White.svg',
    href: '/brand/Jovie-Logo-Icon-White.svg',
  },
  {
    fmt: 'PNG',
    label: 'Mark · PNG · 1024',
    file: 'apple-touch-icon.png',
    href: '/apple-touch-icon.png',
  },
  {
    fmt: 'PNG',
    label: 'Favicon · PNG · 32',
    file: 'favicon-32x32.png',
    href: '/favicon-32x32.png',
  },
  {
    fmt: 'PNG',
    label: 'Favicon · PNG · 96',
    file: 'favicon-96x96.png',
    href: '/favicon-96x96.png',
  },
  {
    fmt: 'PNG',
    label: 'PWA · PNG · 192',
    file: 'web-app-manifest-192x192.png',
    href: '/web-app-manifest-192x192.png',
  },
  {
    fmt: 'PNG',
    label: 'PWA · PNG · 512',
    file: 'web-app-manifest-512x512.png',
    href: '/web-app-manifest-512x512.png',
  },
  {
    fmt: 'SVG',
    label: 'Wordmark · SVG · Cream',
    file: 'Jovie-Logo-Wordmark-Alt-White.svg',
    href: '/brand/Jovie-Logo-Wordmark-Alt-White.svg',
  },
  {
    fmt: 'SVG',
    label: 'Wordmark · SVG · Ink',
    file: 'Jovie-Logo-Wordmark-Alt-Black.svg',
    href: '/brand/Jovie-Logo-Wordmark-Alt-Black.svg',
  },
] as const;

export default function BrandPage() {
  return (
    <div className='bg-black text-[#F5F4F0]'>
      <script type='application/ld+json'>
        {safeJsonLdStringify(BRAND_SCHEMA)}
      </script>
      <HeroSection />
      <MarkSection />
      <WordmarkSection />
      <LockupsSection />
      <ColorUsageSection />
      <ColorPaletteSection />
      <TypeSection />
      <IconPackSection />
      <DownloadsSection />
    </div>
  );
}

function HeroSection() {
  return (
    <section
      id='hero'
      className='relative isolate overflow-hidden bg-[radial-gradient(ellipse_80%_60%_at_50%_30%,#18181c_0%,#0b0b0e_60%,#000_100%)] px-6'
    >
      <div className='mx-auto flex min-h-[80svh] max-w-[1200px] flex-col items-center justify-center py-24 text-center md:py-32'>
        <p className={EYEBROW}>Brand kit · v1.0 · 2026</p>
        <div className='mt-10'>
          <Mark
            size={220}
            color='#F5F4F0'
            title='Jovie mark'
            style={{
              filter: 'drop-shadow(0 12px 60px rgba(245,244,240,0.10))',
            }}
          />
        </div>
        <h1 className='mt-12 font-display text-[clamp(56px,9vw,132px)] font-extrabold leading-[0.95] tracking-[-0.04em]'>
          One mark. <span className='text-tertiary-token'>Any surface.</span>
        </h1>
        <p className='mt-8 max-w-[40rem] font-body text-[clamp(18px,2vw,22px)] leading-[1.45] text-secondary-token'>
          The link your music deserves. Built quiet enough to wear any color,
          any era — and loud enough that a touring DJ can put it on the side of
          a tour bus.
        </p>
        <div className='mt-12 flex flex-wrap items-center justify-center gap-3'>
          <Link
            href='#downloads'
            className='inline-flex h-11 items-center rounded-full bg-[#F5F4F0] px-6 text-[14px] font-medium text-[#08090a] transition-colors hover:bg-white'
          >
            Download brand kit
          </Link>
          <Link
            href='#mark'
            className='inline-flex h-11 items-center rounded-full bg-white/[0.08] px-6 text-[14px] font-medium text-[#F5F4F0] backdrop-blur transition-colors hover:bg-white/[0.14]'
          >
            View guidelines
          </Link>
        </div>
      </div>
    </section>
  );
}

function MarkSection() {
  return (
    <section id='mark' className={`${SECTION_PADDING} ${SECTION_BORDER} px-6`}>
      <div className='mx-auto max-w-[1200px]'>
        <p className={EYEBROW}>01 · The Mark</p>
        <h2 className={`mt-4 ${SECTION_HEAD}`}>A loop with a dot.</h2>
        <p className={LEDE}>
          An infinite feedback loop with a small head — a j-shape that doubles
          as Apple Park from above, the eternal return of attention into action.
          Strict monochrome. Strict geometry.
        </p>

        <div className='mt-14 grid grid-cols-1 gap-6 md:grid-cols-2'>
          <div className='flex aspect-square items-center justify-center rounded-2xl bg-[#F5F4F0]'>
            <Mark size={280} color='#08090a' title='Jovie mark on cream' />
          </div>
          <div className='flex aspect-square items-center justify-center rounded-2xl bg-[#0a0a0c]'>
            <Mark size={280} color='#F5F4F0' title='Jovie mark on ink' />
          </div>
        </div>

        <h3 className='mt-16 font-display text-[clamp(22px,2.5vw,32px)] font-bold tracking-[-0.02em] leading-[1.1]'>
          Construction
        </h3>
        <p className='mt-2 max-w-[40rem] font-body text-[15px] leading-[1.55] text-secondary-token'>
          The mark is built from two circles on a single vertical axis. The
          dot&apos;s diameter is exactly half the inner ring&apos;s diameter —
          every other proportion follows from that one ratio.
        </p>
        <div className='mt-10 flex items-center justify-center rounded-2xl bg-[#F5F4F0] p-8 md:p-16'>
          <ConstructionDiagram />
        </div>

        <h3 className='mt-16 font-display text-[clamp(22px,2.5vw,32px)] font-bold tracking-[-0.02em] leading-[1.1]'>
          Clear space
        </h3>
        <p className='mt-2 max-w-[40rem] font-body text-[15px] leading-[1.55] text-secondary-token'>
          Reserve a clear field around the mark equal to the dot&apos;s diameter
          — call this <span className='font-mono text-[#F5F4F0]'>1×</span>.
          Nothing, ever, inside it.
        </p>
        <div className='mt-10 flex items-center justify-center rounded-2xl bg-[#0F1011] p-8 md:p-12'>
          <ClearSpaceDiagram />
        </div>

        <h3 className='mt-16 font-display text-[clamp(22px,2.5vw,32px)] font-bold tracking-[-0.02em] leading-[1.1]'>
          Minimum sizes
        </h3>
        <p className='mt-2 max-w-[40rem] font-body text-[15px] leading-[1.55] text-secondary-token'>
          The dot must remain visibly separate from the loop. Below 14px the
          form muddles — switch to the solid favicon variant.
        </p>
        <div className='mt-10 rounded-2xl bg-[#0F1011] p-8 md:p-12'>
          <div className='flex flex-wrap items-end justify-center gap-x-8 gap-y-6'>
            {SIZE_LADDER.map(s => (
              <div key={s} className='flex flex-col items-center gap-3'>
                <Mark size={s} color='#F5F4F0' />
                <span className='font-mono text-[11px] text-tertiary-token'>
                  {s}px
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function ConstructionDiagram() {
  const stroke = '#5a5f66';
  const guide = 'rgba(8,9,10,0.25)';
  return (
    <svg
      viewBox='0 0 480 480'
      className='h-auto w-full max-w-[520px]'
      aria-label='Mark construction guides'
      role='img'
    >
      <g transform='translate(60, 60)'>
        <line
          x1='180'
          y1='-30'
          x2='180'
          y2='390'
          stroke={guide}
          strokeDasharray='3 5'
        />
        <line
          x1='-30'
          y1='180'
          x2='390'
          y2='180'
          stroke={guide}
          strokeDasharray='3 5'
        />
        <circle
          cx='180'
          cy='180'
          r='174'
          fill='none'
          stroke={stroke}
          strokeWidth='1.5'
        />
        <circle
          cx='180'
          cy='180'
          r='94'
          fill='none'
          stroke={stroke}
          strokeWidth='1.5'
        />
        <circle
          cx='180'
          cy='47'
          r='47'
          fill='none'
          stroke={stroke}
          strokeWidth='1.5'
        />
        <path fill='#08090a' d={JOVIE_PATH} />
        <g fontFamily='monospace' fontSize='11' fill={stroke}>
          <text x='375' y='184'>
            R = 4r
          </text>
          <text x='280' y='184'>
            r = 2d
          </text>
          <text x='230' y='50'>
            d
          </text>
        </g>
      </g>
    </svg>
  );
}

function ClearSpaceDiagram() {
  return (
    <svg
      viewBox='0 0 720 480'
      className='h-auto w-full max-w-[720px]'
      aria-label='Mark clear-space rule diagram'
      role='img'
    >
      <rect
        x='180'
        y='60'
        width='360'
        height='360'
        fill='none'
        stroke='rgba(245,244,240,0.35)'
        strokeDasharray='6 6'
      />
      <g transform='translate(258, 110)'>
        <path fill='#F5F4F0' d={JOVIE_PATH} transform='scale(0.6)' />
      </g>
      {(
        [
          [180, 60],
          [540, 60],
          [180, 420],
          [540, 420],
        ] as const
      ).map(([x, y]) => (
        <g key={`${x}-${y}`}>
          <line
            x1={x - 12}
            y1={y}
            x2={x + 12}
            y2={y}
            stroke='#8A8F98'
            strokeWidth='1.5'
          />
          <line
            x1={x}
            y1={y - 12}
            x2={x}
            y2={y + 12}
            stroke='#8A8F98'
            strokeWidth='1.5'
          />
        </g>
      ))}
      <g fontFamily='monospace' fontSize='11' fill='#8A8F98'>
        <text x='218' y='50' fill='rgba(255,255,255,0.55)'>
          CLEAR SPACE = 1×
        </text>
        <text x='555' y='240'>
          1×
        </text>
        <text x='358' y='450' textAnchor='middle'>
          1× = diameter of the dot
        </text>
      </g>
    </svg>
  );
}

function WordmarkSection() {
  return (
    <section
      id='wordmark'
      className={`${SECTION_PADDING} ${SECTION_BORDER} px-6`}
    >
      <div className='mx-auto max-w-[1200px]'>
        <p className={EYEBROW}>02 · Wordmark</p>
        <h2 className={`mt-4 ${SECTION_HEAD}`}>JOVIE.</h2>
        <p className={LEDE}>
          Drawn, not typed. A custom geometric all-caps logotype on a uniform
          22-unit stem, with the O cut to the mark&apos;s exact ring ratio. The
          wordmark is the company name with the volume turned up.
        </p>

        <div className='mt-14 flex min-h-[280px] items-center justify-center rounded-2xl bg-[#F5F4F0] p-10 md:p-20'>
          <Wordmark height={120} color='#08090a' title='Jovie wordmark' />
        </div>

        <div className='mt-8 grid grid-cols-1 gap-6 md:grid-cols-2'>
          <div className='flex min-h-[200px] items-center justify-center rounded-2xl bg-[#08090a] ring-1 ring-white/10 p-10'>
            <Wordmark height={72} color='#F5F4F0' />
          </div>
          <div className='flex min-h-[200px] items-center justify-center rounded-2xl bg-[#17171A] p-10'>
            <Wordmark height={72} color='#F5F4F0' />
          </div>
        </div>

        <h3 className='mt-16 font-display text-[clamp(22px,2.5vw,32px)] font-bold tracking-[-0.02em] leading-[1.1]'>
          Craft details
        </h3>
        <p className='mt-2 max-w-[40rem] font-body text-[15px] leading-[1.55] text-secondary-token'>
          The wordmark isn&apos;t a font — it&apos;s five hand-drawn letters
          tuned to read as siblings of the mark. Three quiet decisions do the
          work.
        </p>
        <div className='mt-8 grid grid-cols-1 gap-6 rounded-2xl bg-[#F5F4F0] p-8 text-[#08090a] md:grid-cols-3 md:p-12'>
          <CraftNote
            num='01'
            title='Uniform 22-unit stem'
            body='Every vertical, every diagonal, every horizontal sits at the same optical weight. No light verticals, no heavy diagonals.'
          />
          <CraftNote
            num='02'
            title='O = the mark'
            body="The O's outer R is 50 and inner R is 27 — the exact 174:94 ratio of the mark's ring. The wordmark and the symbol read as the same family."
          />
          <CraftNote
            num='03'
            title='Hand-tuned tracking'
            body='Not -0.05em. J→O opens (12), V→I tightens (8), I→E opens (14). Each pair gets the air its shapes ask for.'
          />
        </div>
      </div>
    </section>
  );
}

function CraftNote({
  num,
  title,
  body,
}: Readonly<{ num: string; title: string; body: string }>) {
  return (
    <div className='flex flex-col gap-3'>
      <span className='font-mono text-[11px] text-[#5a5f66]'>{num}</span>
      <span className='font-display text-[18px] font-bold tracking-[-0.015em]'>
        {title}
      </span>
      <span className='font-body text-[14px] leading-[1.55] text-[#3a3d44]'>
        {body}
      </span>
    </div>
  );
}

function LockupsSection() {
  return (
    <section
      id='lockups'
      className={`${SECTION_PADDING} ${SECTION_BORDER} px-6`}
    >
      <div className='mx-auto max-w-[1200px]'>
        <p className={EYEBROW}>03 · Lockups</p>
        <h2 className={`mt-4 ${SECTION_HEAD}`}>
          Three flavors. Plus one integrated.
        </h2>
        <p className={LEDE}>
          Horizontal is the default for branded asset use. Stacked when the
          surface is square.{' '}
          <strong className='text-primary-token'>Mark-only</strong> is the
          canonical site-chrome lockup — every nav bar, footer, and PWA icon
          renders the mark alone. The integrated lockup (mark for the O) is
          reserved for moments where the wordmark stands alone and the audience
          is brand-literate.
        </p>

        <div className='mt-14 grid grid-cols-1 gap-6 md:grid-cols-3'>
          <LockupTile label='Horizontal · Primary'>
            <Lockup height={56} color='#F5F4F0' />
          </LockupTile>
          <LockupTile label='Stacked · Square surfaces'>
            <Lockup height={48} color='#F5F4F0' stacked />
          </LockupTile>
          <LockupTile label='Mark · Site chrome'>
            <Mark size={104} color='#F5F4F0' />
          </LockupTile>
        </div>

        <div className='mt-6 grid grid-cols-1 gap-6 md:grid-cols-3'>
          <LockupTile label='Horizontal · Cream surface' bg='bg-[#F5F4F0]'>
            <Lockup height={56} color='#08090a' />
          </LockupTile>
          <LockupTile label='Stacked · Cream surface' bg='bg-[#F5F4F0]'>
            <Lockup height={48} color='#08090a' stacked />
          </LockupTile>
          <LockupTile label='Mark · Cream surface' bg='bg-[#F5F4F0]'>
            <Mark size={104} color='#08090a' />
          </LockupTile>
        </div>

        <h3 className='mt-16 font-display text-[clamp(22px,2.5vw,32px)] font-bold tracking-[-0.02em] leading-[1.1]'>
          Integrated lockup — mark for the O
        </h3>
        <p className='mt-2 max-w-[40rem] font-body text-[15px] leading-[1.55] text-secondary-token'>
          The mark&apos;s ring sits where the O sits. Same diameter, same ring
          weight, same negative space — they were drawn to fit. Use it as a
          standalone wordmark when no separate mark is shown nearby.
        </p>
        <div className='mt-10 flex min-h-[260px] items-center justify-center rounded-2xl bg-[#F5F4F0] p-12 md:p-20'>
          <Wordmark height={110} color='#08090a' markAsO />
        </div>
      </div>
    </section>
  );
}

function LockupTile({
  children,
  label,
  bg = 'bg-[#0F1011]',
}: Readonly<{ children: React.ReactNode; label: string; bg?: string }>) {
  return (
    <div>
      <div
        className={`flex aspect-square items-center justify-center rounded-2xl p-6 ${bg}`}
      >
        {children}
      </div>
      <p className='mt-3 text-[13px] text-tertiary-token'>{label}</p>
    </div>
  );
}

function ColorUsageSection() {
  return (
    <section id='usage' className={`${SECTION_PADDING} ${SECTION_BORDER} px-6`}>
      <div className='mx-auto max-w-[1200px]'>
        <p className={EYEBROW}>04 · Color usage</p>
        <h2 className={`mt-4 ${SECTION_HEAD}`}>Strict monochrome.</h2>
        <p className={LEDE}>
          The mark is always one color, and the color always lives in pure
          contrast to its surface. Never half-tones, never gradients on the mark
          itself, never the mark in a saturated brand color. Surfaces can be
          loud — the mark stays quiet.
        </p>

        <h3 className='mt-14 font-display text-[22px] font-bold tracking-[-0.02em]'>
          Do
        </h3>
        <div className='mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4'>
          {MARK_DOS.map(tile => (
            <div key={tile.label}>
              <div
                className={`flex aspect-square items-center justify-center rounded-xl ${tile.bg}`}
              >
                <div className={tile.fg}>
                  <Mark size={96} color='currentColor' />
                </div>
              </div>
              <p className='mt-2 text-[13px] text-tertiary-token'>
                {tile.label}
              </p>
            </div>
          ))}
        </div>

        <h3 className='mt-16 font-display text-[22px] font-bold tracking-[-0.02em]'>
          Don&apos;t
        </h3>
        <div className='mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4'>
          {MARK_DONTS.map(tile => (
            <DontTile key={tile.label} {...tile} />
          ))}
        </div>
      </div>
    </section>
  );
}

function DontTile({
  label,
  style,
  kind,
}: Readonly<{
  label: string;
  style?: string;
  kind:
    | 'mark'
    | 'outline'
    | 'gradient'
    | 'shadow'
    | 'low-contrast'
    | 'reshape'
    | 'crowd';
}>) {
  let body: React.ReactNode = null;
  if (kind === 'mark') {
    body = (
      <div style={{ transform: style }}>
        <Mark size={92} color='#F5F4F0' />
      </div>
    );
  } else if (kind === 'outline') {
    body = (
      <svg width='92' height='92' viewBox='0 0 360 360' aria-hidden='true'>
        <path fill='none' stroke='#F5F4F0' strokeWidth='6' d={JOVIE_PATH} />
      </svg>
    );
  } else if (kind === 'gradient') {
    body = (
      <svg width='92' height='92' viewBox='0 0 360 360' aria-hidden='true'>
        <defs>
          <linearGradient id='bad-grad' x1='0' y1='0' x2='0' y2='1'>
            <stop offset='0' stopColor='#f72585' />
            <stop offset='1' stopColor='#3a7bff' />
          </linearGradient>
        </defs>
        <path fill='url(#bad-grad)' d={JOVIE_PATH} />
      </svg>
    );
  } else if (kind === 'shadow') {
    body = (
      <div style={{ filter: 'drop-shadow(6px 6px 0 #FF4D5F)' }}>
        <Mark size={92} color='#F5F4F0' />
      </div>
    );
  } else if (kind === 'low-contrast') {
    body = (
      <div className='rounded-xl bg-[#0F1011] p-4'>
        <Mark size={78} color='#2A2C32' />
      </div>
    );
  } else if (kind === 'reshape') {
    body = (
      <svg width='92' height='92' viewBox='0 0 360 360' aria-hidden='true'>
        <circle cx='180' cy='180' r='174' fill='#F5F4F0' />
        <circle cx='180' cy='180' r='94' fill='#0F1011' />
        <rect x='154' y='10' width='52' height='80' rx='4' fill='#F5F4F0' />
      </svg>
    );
  } else if (kind === 'crowd') {
    body = (
      <div className='flex items-center gap-1'>
        <Mark size={60} color='#F5F4F0' />
        <span className='font-display text-[32px] font-extrabold tracking-[-0.05em]'>
          JOVIE
        </span>
      </div>
    );
  }
  return (
    <div>
      <div className='relative flex aspect-square items-center justify-center overflow-hidden rounded-xl bg-[#0F1011]'>
        {body}
        <svg
          viewBox='0 0 100 100'
          preserveAspectRatio='none'
          className='pointer-events-none absolute inset-0 h-full w-full'
          aria-hidden='true'
        >
          <line
            x1='6'
            y1='6'
            x2='94'
            y2='94'
            stroke='#FF4D5F'
            strokeWidth='1.4'
            strokeLinecap='round'
            vectorEffect='non-scaling-stroke'
          />
        </svg>
        <span className='absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full bg-[#FF4D5F]'>
          <svg width='10' height='10' viewBox='0 0 10 10' aria-hidden='true'>
            <path
              d='M1 1 L9 9 M9 1 L1 9'
              stroke='#F5F4F0'
              strokeWidth='1.6'
              strokeLinecap='round'
            />
          </svg>
        </span>
      </div>
      <p className='mt-2 text-[13px] text-[#F5F4F0]'>{label}</p>
    </div>
  );
}

function ColorPaletteSection() {
  return (
    <section id='color' className={`${SECTION_PADDING} ${SECTION_BORDER} px-6`}>
      <div className='mx-auto max-w-[1200px]'>
        <p className={EYEBROW}>05 · Color</p>
        <h2 className={`mt-4 ${SECTION_HEAD}`}>No brand color.</h2>
        <p className={LEDE}>
          Jovie has no single primary accent. Cream on ink does the heavy
          lifting; the surface ladder carries hierarchy. The feature hues rotate
          across cards Apple-style — they live on text, headlines, and
          highlights, never on filled brand surfaces or buttons.
        </p>

        <h3 className='mt-14 font-display text-[22px] font-bold tracking-[-0.02em]'>
          Surface ladder
        </h3>
        <div className='mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5'>
          {PALETTE.surface.map(c => (
            <Swatch key={c.hex} hex={c.hex} name={c.name} token={c.token} />
          ))}
        </div>

        <h3 className='mt-16 font-display text-[22px] font-bold tracking-[-0.02em]'>
          Feature hues
        </h3>
        <p className='mt-2 max-w-[40rem] font-body text-[15px] leading-[1.55] text-secondary-token'>
          A carbon-style palette of eight equal accents — no hierarchy, no
          &quot;brand purple.&quot; Use on card-title text, eyebrows, data
          highlights, and section dividers, rotating in the order below. Never
          as a button fill, never as a large surface.
        </p>
        <div className='mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8'>
          {PALETTE.feature.map(c => (
            <Swatch key={c.hex} hex={c.hex} name={c.name} mini />
          ))}
        </div>
      </div>
    </section>
  );
}

function Swatch({
  hex,
  name,
  token,
  mini = false,
}: Readonly<{ hex: string; name: string; token?: string; mini?: boolean }>) {
  const isCream = hex === '#F5F4F0';
  const textColor = isCream ? 'text-[#08090a]' : 'text-[#F5F4F0]';
  const innerShadow = isCream
    ? 'shadow-[inset_0_0_0_1px_rgba(0,0,0,0.06)]'
    : 'shadow-[inset_0_0_0_1px_rgba(255,255,255,0.05)]';
  return (
    <div>
      <div
        className={`flex flex-col justify-end rounded-xl p-4 ${textColor} ${innerShadow} ${mini ? 'aspect-square' : 'aspect-[5/4]'}`}
        style={{ backgroundColor: hex }}
      >
        <span className='font-display text-[14px] font-semibold'>{name}</span>
      </div>
      <p className='mt-2 font-mono text-[11px] text-tertiary-token'>
        {hex.toUpperCase()}
      </p>
      {token ? (
        <p className='font-mono text-[11px] text-tertiary-token opacity-60'>
          {token}
        </p>
      ) : null}
    </div>
  );
}

function TypeSection() {
  return (
    <section id='type' className={`${SECTION_PADDING} ${SECTION_BORDER} px-6`}>
      <div className='mx-auto max-w-[1200px]'>
        <p className={EYEBROW}>06 · Type</p>
        <h2 className={`mt-4 ${SECTION_HEAD}`}>Satoshi. DM Sans.</h2>
        <p className={LEDE}>
          Satoshi for display (800/700/600). DM Sans for body. Inter for product
          UI. Three faces total, mirrored from the existing Jovie design system
          — the brand page documents the canon, it doesn&apos;t invent one.
        </p>

        <div className='mt-12 flex flex-col'>
          {TYPE_ROWS.map((row, i) => (
            <div
              key={row.label}
              className={`grid grid-cols-1 gap-6 py-7 md:grid-cols-[240px_1fr] md:gap-8 ${i === 0 ? 'border-t border-white/10' : 'border-t border-white/10'}`}
            >
              <span className='font-mono text-[12px] text-tertiary-token'>
                {row.label}
                <span className='block opacity-70'>{row.spec}</span>
              </span>
              <span
                className={`${row.className} ${TYPE_SAMPLE_SIZES[row.label] ?? ''}`}
              >
                {row.sample}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function IconPackSection() {
  return (
    <section id='icons' className={`${SECTION_PADDING} ${SECTION_BORDER} px-6`}>
      <div className='mx-auto max-w-[1200px]'>
        <p className={EYEBROW}>07 · Icon pack</p>
        <h2 className={`mt-4 ${SECTION_HEAD}`}>Every surface, every size.</h2>
        <p className={LEDE}>
          The mark, dressed for every container the operating system can throw
          at it. Render once, deploy everywhere — favicons, PWA icons, app
          icons, social avatars.
        </p>

        <h3 className='mt-14 font-display text-[clamp(20px,2vw,22px)] font-bold tracking-[-0.02em]'>
          App icons
        </h3>
        <div className='mt-6 grid grid-cols-1 gap-6 sm:grid-cols-3'>
          <AppIconTile label='iOS · Dark' subtitle='1024 · primary'>
            <AppIconShape shape='ios' bg='#08090a' fg='#F5F4F0' />
          </AppIconTile>
          <AppIconTile label='iOS · Light' subtitle='1024 · light pair'>
            <AppIconShape shape='ios' bg='#F5F4F0' fg='#08090a' />
          </AppIconTile>
          <AppIconTile label='macOS' subtitle='squircle · 1024'>
            <AppIconShape shape='macos' bg='#08090a' fg='#F5F4F0' />
          </AppIconTile>
          <AppIconTile label='watchOS · Circular' subtitle='complication-safe'>
            <AppIconShape shape='circle' bg='#08090a' fg='#F5F4F0' />
          </AppIconTile>
          <AppIconTile label='Android · Adaptive' subtitle='maskable'>
            <AppIconShape shape='ios' bg='#08090a' fg='#F5F4F0' />
          </AppIconTile>
          <AppIconTile
            label='Material You · Monochrome'
            subtitle='themed layer'
          >
            <AppIconShape shape='ios' bg='transparent' fg='#F5F4F0' />
          </AppIconTile>
        </div>

        <h3 className='mt-16 font-display text-[clamp(20px,2vw,22px)] font-bold tracking-[-0.02em]'>
          Favicons
        </h3>
        <div className='mt-6 rounded-2xl bg-[#0F1011] p-8 md:p-12'>
          <div className='grid grid-cols-3 items-end gap-6 sm:grid-cols-5'>
            {FAVICON_SIZES.map(s => (
              <div key={s} className='flex flex-col items-center gap-3'>
                <div
                  className='grid place-items-center rounded-md bg-[#08090a]'
                  style={{
                    width: s + 16,
                    height: s + 16,
                    borderRadius: Math.min(8, s / 4),
                  }}
                >
                  <Mark size={s} color='#F5F4F0' />
                </div>
                <span className='font-mono text-[11px] text-tertiary-token'>
                  {s}×{s}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function AppIconShape({
  shape,
  bg,
  fg,
}: Readonly<{ shape: 'ios' | 'macos' | 'circle'; bg: string; fg: string }>) {
  const radius = shape === 'circle' ? 100 : shape === 'macos' ? 22 : 22;
  const isCircle = shape === 'circle';
  return (
    <div
      className='grid place-items-center shadow-[0_16px_40px_rgba(0,0,0,0.45),inset_0_0_0_1px_rgba(255,255,255,0.05)]'
      style={{
        width: 168,
        height: 168,
        borderRadius: isCircle ? '50%' : `${radius}%`,
        background: bg === 'transparent' ? 'rgba(255,255,255,0.04)' : bg,
      }}
    >
      <Mark size={104} color={fg} />
    </div>
  );
}

function AppIconTile({
  children,
  label,
  subtitle,
}: Readonly<{ children: React.ReactNode; label: string; subtitle: string }>) {
  return (
    <div>
      <div className='flex aspect-square items-center justify-center rounded-2xl bg-[#1c1d20] p-8'>
        {children}
      </div>
      <p className='mt-3 font-display text-[14px] font-semibold'>{label}</p>
      <p className='text-[13px] text-tertiary-token'>{subtitle}</p>
    </div>
  );
}

function DownloadsSection() {
  return (
    <section
      id='downloads'
      className={`${SECTION_PADDING} ${SECTION_BORDER} px-6`}
    >
      <div className='mx-auto max-w-[1200px]'>
        <p className={EYEBROW}>08 · Downloads</p>
        <h2 className={`mt-4 ${SECTION_HEAD}`}>Take the kit.</h2>
        <p className={LEDE}>
          Vector and raster, ready to drop into any deck, doc, or render. Every
          asset is rendered from the same source path — colors stay locked
          across formats.
        </p>

        <div className='mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3'>
          {DOWNLOADS.map(d => (
            <a
              key={d.file}
              href={d.href}
              download={d.file}
              className='flex flex-col gap-4 rounded-xl border border-white/10 bg-[#0F1011] p-5 transition-colors hover:border-white/[0.18] hover:bg-[#17171A]'
            >
              <div className='flex items-center justify-between'>
                <span className='font-mono text-[11px] text-[#F5F4F0]'>
                  {d.fmt}
                </span>
                <svg
                  width='14'
                  height='14'
                  viewBox='0 0 14 14'
                  fill='none'
                  stroke='#8A8F98'
                  strokeWidth='1.5'
                  strokeLinecap='round'
                  strokeLinejoin='round'
                  aria-hidden='true'
                >
                  <path d='M7 1v9m0 0L3 6m4 4l4-4M2 13h10' />
                </svg>
              </div>
              <span className='font-display text-[16px] font-semibold'>
                {d.label}
              </span>
              <span className='font-mono text-[11px] text-tertiary-token'>
                {d.file}
              </span>
            </a>
          ))}
        </div>

        <div className='mt-10 rounded-2xl bg-gradient-to-br from-[#17171A] to-[#0a0a0c] p-8 md:p-12'>
          <p className='font-display text-[clamp(20px,2vw,28px)] font-bold tracking-[-0.02em]'>
            Need something we haven&apos;t shipped?
          </p>
          <p className='mt-2 max-w-[40rem] font-body text-[15px] leading-[1.55] text-secondary-token'>
            Press, partnerships, licensing — reach{' '}
            <a
              href='mailto:brand@jov.ie'
              className='border-b border-white/30 text-[#F5F4F0] transition-colors hover:border-white/60'
            >
              brand@jov.ie
            </a>{' '}
            and we&apos;ll get you what you need.
          </p>
        </div>
      </div>
    </section>
  );
}
