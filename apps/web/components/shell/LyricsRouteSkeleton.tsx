const LYRIC_LINES = [
  { key: 'opening', width: '92%' },
  { key: 'response', width: '76%' },
  { key: 'lift', width: '88%' },
  { key: 'turn', width: '64%' },
  { key: 'resolve', width: '84%' },
  { key: 'outro', width: '72%' },
] as const;

export function LyricsRouteSkeleton() {
  return (
    <section
      aria-label='Loading lyrics'
      aria-busy='true'
      aria-live='polite'
      className='flex h-full min-h-0 flex-col bg-(--linear-app-content-surface)'
    >
      <header className='flex h-16 shrink-0 items-center justify-between gap-4 border-b border-(--linear-app-shell-border) px-6'>
        <div className='min-w-0 space-y-2'>
          <div className='skeleton h-5 w-44 rounded-md' />
          <div className='skeleton h-3.5 w-28 rounded' />
        </div>
        <div className='skeleton h-8 w-8 rounded-full' />
      </header>

      <div className='min-h-0 flex-1 overflow-hidden'>
        <div className='mx-auto flex h-full max-w-2xl flex-col justify-center px-6 py-10'>
          <div className='space-y-5'>
            {LYRIC_LINES.map(line => (
              <div
                key={`lyrics-loading-line-${line.key}`}
                className='skeleton h-7 rounded-lg'
                style={{ width: line.width }}
              />
            ))}
          </div>
        </div>
      </div>

      <footer className='flex h-14 shrink-0 items-center gap-4 border-t border-(--linear-app-shell-border) px-6'>
        <div className='skeleton h-3 w-10 rounded' />
        <div className='skeleton h-1.5 flex-1 rounded-full' />
        <div className='skeleton h-3 w-10 rounded' />
      </footer>
    </section>
  );
}
