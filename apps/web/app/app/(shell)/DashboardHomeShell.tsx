import Link from 'next/link';
import { APP_ROUTES } from '@/constants/routes';

const STARTER_PROMPTS = [
  'Draft a release rollout plan for my next single',
  'Turn my artist bio into a sharper pitch',
  'Show me what I should fix on my profile first',
] as const;

export function DashboardHomeShell() {
  return (
    <div className='flex h-full min-h-0 flex-col overflow-auto'>
      <div className='mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-4 py-6 sm:px-6 lg:px-8'>
        <section className='rounded-[28px] border border-(--linear-app-frame-seam) bg-(--linear-app-content-surface) p-5 sm:p-6'>
          <div className='space-y-2'>
            <p className='text-[11px] font-[600] uppercase tracking-[0.18em] text-tertiary-token'>
              Home
            </p>
            <h1 className='text-balance text-[28px] font-[620] tracking-[-0.03em] text-primary-token sm:text-[34px]'>
              Start a new thread without waiting on the full workspace.
            </h1>
            <p className='max-w-2xl text-[14px] leading-6 text-secondary-token'>
              Drop in a prompt and jump straight into Jovie, or open the full
              chat workspace when you want the full canvas.
            </p>
          </div>

          <form
            action={APP_ROUTES.CHAT}
            method='get'
            className='mt-5 space-y-3 rounded-[24px] border border-(--linear-app-frame-seam) bg-surface-0 p-3'
          >
            <label htmlFor='dashboard-home-query' className='sr-only'>
              Ask Jovie anything
            </label>
            <textarea
              id='dashboard-home-query'
              name='q'
              rows={3}
              placeholder='Ask Jovie anything'
              className='min-h-[112px] w-full resize-none rounded-[18px] border border-transparent bg-transparent px-3 py-3 text-[15px] leading-6 text-primary-token outline-none placeholder:text-tertiary-token focus:border-(--linear-app-frame-seam)'
            />

            <div className='flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
              <div className='flex flex-wrap gap-2'>
                {STARTER_PROMPTS.map(prompt => (
                  <Link
                    key={prompt}
                    href={`${APP_ROUTES.CHAT}?q=${encodeURIComponent(prompt)}`}
                    className='rounded-full border border-(--linear-app-frame-seam) bg-(--linear-app-content-surface) px-3 py-1.5 text-[12px] font-[510] text-secondary-token transition-colors hover:text-primary-token'
                  >
                    {prompt}
                  </Link>
                ))}
              </div>

              <div className='flex items-center gap-2'>
                <Link
                  href={APP_ROUTES.CHAT}
                  className='inline-flex h-10 items-center justify-center rounded-full border border-(--linear-app-frame-seam) px-4 text-[13px] font-[560] text-secondary-token transition-colors hover:text-primary-token'
                >
                  Open workspace
                </Link>
                <button
                  type='submit'
                  aria-label='New thread'
                  className='inline-flex h-10 items-center justify-center rounded-full bg-primary-token px-4 text-[13px] font-[600] text-primary-foreground transition-opacity hover:opacity-92'
                >
                  New thread
                </button>
              </div>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}
