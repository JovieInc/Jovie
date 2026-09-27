// Green fixture for JOV-INV-036: semantic layers and local stacking only.
export function Overlay() {
  return (
    <div className='fixed inset-0 z-modal'>
      <div className='relative z-10' style={{ zIndex: 1 }} />
      <div className='z-[var(--z-index-popover)]' />
    </div>
  );
}
