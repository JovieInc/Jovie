export function JankHome() {
  function onScroll() {
    const box = document.querySelector('.jank')?.getBoundingClientRect();
    if (box) document.body.dataset.top = String(box.top);
  }

  window.addEventListener('scroll', onScroll);
  window.addEventListener('touchmove', onScroll, { capture: true });

  return (
    <div className='min-h-screen h-screen'>
      <html className='overscroll-none touch-none' />
    </div>
  );
}
