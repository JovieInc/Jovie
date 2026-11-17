import './AuthBackdrop.css';

/** Pen odZZY page backdrop behind the stack auth column. Decorative only. */
export function AuthBackdrop() {
  return (
    <div
      aria-hidden
      data-auth-backdrop
      className='pointer-events-none fixed inset-0 -z-10'
    >
      <div className='auth-backdrop-glow absolute inset-0' />
      <div className='auth-backdrop-veil absolute inset-0' />
    </div>
  );
}
