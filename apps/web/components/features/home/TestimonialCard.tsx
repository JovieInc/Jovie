interface TestimonialCardProps {
  readonly name: string;
  readonly title: string;
  readonly quote: string;
  readonly initials: string;
}

export function TestimonialCard({
  name,
  title,
  quote,
  initials,
}: TestimonialCardProps) {
  return (
    <div
      className='relative flex flex-col items-center rounded-xl p-8 text-center transition-colors duration-[var(--linear-duration-normal)]'
      style={{
        backgroundColor: 'var(--linear-bg-surface-0)',
        border: '1px solid var(--linear-border-subtle)',
        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
      }}
    >
      <div className='mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-surface-2 text-lg font-semibold text-secondary-token'>
        {initials}
      </div>
      <blockquote className='flex-1 text-[15px] leading-relaxed text-secondary-token italic'>
        &ldquo;{quote}&rdquo;
      </blockquote>
      <div className='mt-5'>
        <p className='text-[15px] font-medium text-primary-token'>{name}</p>
        <p className='mt-0.5 text-[13px] text-tertiary-token'>{title}</p>
      </div>
    </div>
  );
}
