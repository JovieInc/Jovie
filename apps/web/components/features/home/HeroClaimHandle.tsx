import { APP_ROUTES } from '@/constants/routes';

interface HeroClaimHandleProps {
  readonly submitButtonTestId?: string;
}

const FALLBACK_ROW_STYLE = {
  minHeight: 56,
  background:
    'linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.018) 100%)',
  border: '1px solid rgba(255,255,255,0.08)',
  boxShadow:
    '0 10px 24px rgba(0,0,0,0.14), inset 0 1px 0 rgba(255,255,255,0.04)',
} as const;

const FALLBACK_BUTTON_STYLE = {
  height: 38,
  fontSize: '12px',
  fontWeight: 510,
  letterSpacing: '-0.005em',
  background:
    'linear-gradient(180deg, rgba(244,245,246,0.96) 0%, rgba(228,230,232,0.92) 100%)',
  color: 'rgb(8,9,10)',
  boxShadow:
    '0 6px 18px rgba(0,0,0,0.14), inset 0 1px 0 rgba(255,255,255,0.34)',
  border: '1px solid rgba(255,255,255,0.12)',
} as const;

export function HeroClaimHandle({
  submitButtonTestId,
}: Readonly<HeroClaimHandleProps>) {
  return (
    <form action={APP_ROUTES.SIGNUP} className='w-full' method='get'>
      <input name='redirect_url' type='hidden' value={APP_ROUTES.ONBOARDING} />
      <input name='source' type='hidden' value='homepage_primary_cta' />
      <div
        className='relative flex w-full items-center gap-2 rounded-[1rem] p-[0.35rem]'
        style={FALLBACK_ROW_STYLE}
      >
        <div
          aria-hidden='true'
          className='pointer-events-none absolute inset-x-2 top-0 h-px rounded-full'
          style={{
            background:
              'linear-gradient(90deg, transparent, rgba(255,255,255,0.2) 20%, rgba(255,255,255,0.24) 50%, rgba(255,255,255,0.18) 80%, transparent)',
          }}
        />
        <div className='flex min-w-0 flex-1 items-center gap-0 pl-3.5 pr-1.5'>
          <span
            className='shrink-0 select-none'
            style={{
              fontSize: '15px',
              fontWeight: 450,
              letterSpacing: '-0.016em',
              color: 'var(--linear-text-tertiary)',
              fontFamily: 'inherit',
            }}
          >
            jov.ie/
          </span>
          <input
            aria-label='Choose your handle'
            autoCapitalize='none'
            autoComplete='off'
            autoCorrect='off'
            className='min-w-0 flex-1 bg-transparent placeholder:text-quaternary-token focus-visible:outline-none'
            name='handle'
            placeholder='you'
            style={{
              fontSize: '16px',
              fontWeight: 510,
              letterSpacing: '-0.022em',
              color: 'var(--linear-text-primary)',
            }}
            type='text'
          />
        </div>

        <button
          className='group inline-flex shrink-0 items-center justify-center gap-1.5 rounded-[0.8rem] px-4 transition-all duration-slow hover:brightness-110 active:scale-[0.98] focus-ring-themed'
          data-testid={submitButtonTestId}
          style={FALLBACK_BUTTON_STYLE}
          type='submit'
        >
          <span className='whitespace-nowrap'>Claim</span>
        </button>
      </div>
    </form>
  );
}
