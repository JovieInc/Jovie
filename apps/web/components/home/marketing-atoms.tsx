/**
 * Shared atomic components for the marketing homepage.
 * Extracted to eliminate duplication across section components.
 */

/** Thin gradient rule used between homepage sections */
export function SectionDivider() {
  return (
    <hr
      className='mx-auto max-w-lg border-0 h-px'
      style={{
        background:
          'linear-gradient(to right, transparent, rgba(255,255,255,0.08), transparent)',
      }}
    />
  );
}

/** Pill-shaped section label (e.g. "Built for independent artists", "Pricing") */
export function SectionLabel({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  return (
    <span className='inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-medium tracking-[-0.01em] text-[color:var(--linear-text-tertiary)] border border-[var(--linear-border-subtle)]'>
      {children}
    </span>
  );
}

/** Green pulsing dot + short trust copy below a CTA */
export function LiveSignal({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  return (
    <p
      className='flex items-center justify-center gap-2'
      style={{
        fontSize: '12px',
        fontWeight: 450,
        letterSpacing: '0.01em',
        color: 'var(--linear-text-tertiary)',
      }}
    >
      <span
        aria-hidden='true'
        className='inline-block h-1.5 w-1.5 rounded-full bg-[var(--linear-success)] shadow-[0_0_6px_var(--linear-success)]'
      />{' '}
      {children}
    </p>
  );
}
