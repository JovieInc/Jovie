export function JankHome() {
  function onScroll() {
    const box = document.querySelector('.jank')?.getBoundingClientRect();
    if (box) document.body.dataset.top = String(box.top);
  }

  window.addEventListener('scroll', onScroll);
  window.addEventListener('touchmove', onScroll, { capture: true });

  document.documentElement.style.overscrollBehavior = 'none';
  document.body.style.touchAction = 'none';

  return <div className='min-h-screen h-screen'>Find me</div>;
}
