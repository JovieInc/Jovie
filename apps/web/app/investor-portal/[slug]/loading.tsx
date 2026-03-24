const SKELETON_LINES = [
  'skel-1',
  'skel-2',
  'skel-3',
  'skel-4',
  'skel-5',
  'skel-6',
  'skel-7',
  'skel-8',
];

const LINE_WIDTHS = ['85%', '92%', '78%', '95%', '70%', '88%', '82%', '90%'];

export default function MemoLoading() {
  return (
    <div className='px-4 pt-8 sm:px-6 lg:pt-12'>
      <div className='mx-auto max-w-5xl animate-pulse space-y-4'>
        <div className='h-8 w-64 rounded bg-[var(--color-bg-surface-1)]' />
        <div className='h-4 w-32 rounded bg-[var(--color-bg-surface-1)]' />
        <div className='mt-8 space-y-3'>
          {SKELETON_LINES.map((key, i) => (
            <div
              key={key}
              className='h-4 rounded bg-[var(--color-bg-surface-1)]'
              style={{ width: LINE_WIDTHS[i] }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
