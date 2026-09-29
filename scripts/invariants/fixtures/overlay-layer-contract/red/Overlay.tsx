// Deliberate-red fixture for JOV-INV-039: every value here is a magic number.
export function Overlay() {
  return (
    <div className='fixed inset-0 z-[999]'>
      <div className='z-100' style={{ zIndex: 500 }} />
    </div>
  );
}
