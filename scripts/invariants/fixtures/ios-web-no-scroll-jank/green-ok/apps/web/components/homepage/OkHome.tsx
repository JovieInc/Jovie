export function OkHome() {
  function onScroll() {
    requestAnimationFrame(() => {
      const y = window.scrollY;
      document.documentElement.dataset.scrolled = y > 8 ? 'true' : 'false';
    });
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('touchmove', onScroll, { passive: true });

  return <div className='min-h-svh h-dvh'>Find me</div>;
}
