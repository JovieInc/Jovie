interface RespondScreenProps {
  readonly title: string;
  readonly description: string;
  readonly confirmLabel?: string;
  readonly token?: string;
  readonly action?: string;
}

/**
 * Shared screen shell: Jovie wordmark + headline + support line, with an
 * optional confirmation form. The confirm form is the ONLY element that can
 * trigger a stage change, and it navigates via POST.
 */
export function RespondScreen({
  title,
  description,
  confirmLabel,
  token,
  action,
}: RespondScreenProps) {
  return (
    <div className='dark flex min-h-screen items-center justify-center bg-(--color-bg-base)'>
      <div className='max-w-md text-center'>
        <span className='mb-6 block text-(length:--text-lg) font-bold tracking-tight text-(--color-text-primary-token)'>
          Jovie
        </span>
        <h1 className='text-balance text-(length:--text-2xl) font-(--font-weight-bold) text-(--color-text-primary-token)'>
          {/* ui-casing-allow: marketing sentence-style copy */}
          {title}
        </h1>
        <p className='mt-2 text-(--color-text-tertiary-token)'>{description}</p>
        {confirmLabel ? (
          <form method='post' action='/api/investors/respond' className='mt-8'>
            <input type='hidden' name='token' value={token} />
            <input type='hidden' name='action' value={action} />
            <button
              type='submit'
              className='rounded-(--radius-pill) bg-(--color-text-primary-token) px-8 py-3 font-(--font-weight-semibold) text-(--color-bg-base)'
            >
              {confirmLabel}
            </button>
          </form>
        ) : null}
      </div>
    </div>
  );
}
