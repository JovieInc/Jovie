const CARD_KEYS = Array.from({ length: 3 }, (_, i) => `revival-${i}`);

export default function YouTubeRevivalLoading() {
  return (
    <div className='space-y-4 px-4 py-3' aria-busy='true'>
      {/* Quota bar skeleton */}
      <div className='h-16 rounded-xl border border-subtle skeleton' />
      {/* Candidate card skeletons */}
      {CARD_KEYS.map(key => (
        <div
          key={key}
          className='h-28 rounded-xl border border-subtle skeleton'
        />
      ))}
    </div>
  );
}
