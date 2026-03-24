import { FundraiseProgress } from './FundraiseProgress';

interface InvestorStickyBarProps {
  readonly bookCallUrl: string | null;
  readonly investUrl: string | null;
  readonly showProgress: boolean;
  readonly raiseTarget: number | null;
  readonly committedAmount: number | null;
  readonly investorCount: number | null;
}

/**
 * Bottom persistent action bar for investor portal.
 * Liquid glass background with Invest + Book a Call buttons.
 * Optional fundraise progress indicator.
 */
export function InvestorStickyBar({
  bookCallUrl,
  investUrl,
  showProgress,
  raiseTarget,
  committedAmount,
  investorCount,
}: InvestorStickyBarProps) {
  const hasAnyButton = bookCallUrl || investUrl;

  if (!hasAnyButton && !showProgress) return null;

  return (
    <div
      className='fixed bottom-0 left-0 right-0 z-50 border-t'
      style={{
        background: 'var(--liquid-glass-bg)',
        backdropFilter: `blur(var(--liquid-glass-blur))`,
        WebkitBackdropFilter: `blur(var(--liquid-glass-blur))`,
        borderColor: 'var(--liquid-glass-border)',
      }}
    >
      <div className='mx-auto flex max-w-4xl flex-col items-center gap-3 px-4 py-3 sm:flex-row sm:justify-between sm:gap-4 sm:py-4'>
        {/* Progress bar (optional) */}
        {showProgress && raiseTarget && (
          <FundraiseProgress
            raiseTarget={raiseTarget}
            committedAmount={committedAmount ?? 0}
            investorCount={investorCount ?? 0}
          />
        )}

        {/* Action buttons */}
        <div className='flex w-full gap-3 sm:w-auto'>
          {investUrl && (
            <a
              href={investUrl}
              target='_blank'
              rel='noopener noreferrer'
              className='w-full rounded-[var(--radius-pill)] px-6 py-2.5 text-center text-[length:var(--text-sm)] font-[var(--font-weight-semibold)] sm:w-auto'
              style={{
                background: 'var(--color-btn-primary-bg)',
                color: 'var(--color-btn-primary-fg)',
                boxShadow: 'var(--shadow-button-inset)',
              }}
            >
              Invest
            </a>
          )}
          {bookCallUrl && (
            <a
              href={bookCallUrl}
              target='_blank'
              rel='noopener noreferrer'
              className='w-full rounded-[var(--radius-pill)] px-6 py-2.5 text-center text-[length:var(--text-sm)] font-[var(--font-weight-semibold)] sm:w-auto'
              style={{
                background: 'var(--color-btn-secondary-bg)',
                color: 'var(--color-btn-secondary-fg)',
              }}
            >
              Book a Call
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
