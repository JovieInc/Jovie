// @coverage-via apps/web/tests/unit/design-system/linear-token-retire-jov-5465.test.ts
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
    <div className='relative flex flex-col items-center rounded-xl border border-subtle bg-surface-0 p-8 text-center shadow-card transition-colors duration-(--duration-normal)'>
      <div className='mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-surface-2 text-lg font-semibold text-secondary-token'>
        {initials}
      </div>
      <blockquote className='flex-1 text-mid leading-relaxed text-secondary-token italic'>
        &ldquo;{quote}&rdquo;
      </blockquote>
      <div className='mt-5'>
        <p className='text-mid font-medium text-primary-token'>{name}</p>
        <p className='mt-0.5 text-app text-tertiary-token'>{title}</p>
      </div>
    </div>
  );
}
