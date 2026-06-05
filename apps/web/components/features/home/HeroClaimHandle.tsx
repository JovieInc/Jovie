import { APP_ROUTES } from '@/constants/routes';

interface HeroClaimHandleProps {
  readonly submitButtonTestId?: string;
}

export function HeroClaimHandle({
  submitButtonTestId,
}: Readonly<HeroClaimHandleProps>) {
  return (
    <form action={APP_ROUTES.SIGNUP} className='w-full' method='get'>
      <input name='redirect_url' type='hidden' value={APP_ROUTES.START} />
      <div
        className='system-b-claim-handle-row relative flex w-full items-center gap-2'
        data-size='hero'
        data-available='false'
      >
        <div className='flex min-w-0 flex-1 items-center gap-0 pl-3.5 pr-1.5'>
          <span
            className='system-b-claim-handle-domain shrink-0 select-none'
            data-size='hero'
          >
            jov.ie/
          </span>
          <input
            aria-label='Choose your handle'
            autoCapitalize='none'
            autoComplete='off'
            autoCorrect='off'
            className='system-b-claim-handle-input min-w-0 flex-1 bg-transparent placeholder:text-quaternary-token focus-visible:outline-none'
            data-size='hero'
            data-available='false'
            name='handle'
            placeholder='you'
            type='text'
          />
        </div>

        <button
          className='system-b-claim-handle-button group inline-flex shrink-0 items-center justify-center gap-1.5 focus-ring-themed'
          data-testid={submitButtonTestId}
          data-size='hero'
          data-disabled='false'
          type='submit'
        >
          <span className='whitespace-nowrap'>Claim</span>
        </button>
      </div>
    </form>
  );
}
