/**
 * Legal pages loading skeleton
 * Matches the legal layout with document-style content
 */
export default function LegalLoading() {
  return (
    <div className='prose prose-neutral dark:prose-invert max-w-none'>
      {/* Title skeleton */}
      <div className='h-10 w-64 skeleton rounded-lg mb-4' />
      {/* Last updated skeleton */}
      <div className='h-4 w-48 skeleton rounded-md mb-8' />

      {/* Content paragraphs skeleton */}
      <div className='space-y-6'>
        {Array.from({ length: 8 }, (_, i) => (
          <div key={`legal-para-${i + 1}`} className='space-y-2'>
            {/* Section heading */}
            {i % 3 === 0 && (
              <div className='h-6 w-48 skeleton rounded-md mb-3' />
            )}
            {/* Paragraph lines */}
            <div className='h-4 w-full skeleton rounded-md' />
            <div className='h-4 w-11/12 skeleton rounded-md' />
            <div className='h-4 w-4/5 skeleton rounded-md' />
          </div>
        ))}
      </div>
    </div>
  );
}
