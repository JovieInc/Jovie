import { cn } from '@/lib/utils';

export interface FigCardProps {
  readonly title: string;
  readonly description: string;
  readonly icon?: React.ReactNode;
  readonly className?: string;
}

/**
 * Clean feature card for value proposition section.
 * Icon + title + description, no labels.
 */
export function FigCard({ title, description, icon, className }: FigCardProps) {
  return (
    <div
      className={cn(
        'homepage-surface-card rounded-[1rem] p-6 md:p-7',
        className
      )}
    >
      {icon && (
        <div className='mb-4 flex h-8 w-8 items-center justify-center text-tertiary-token'>
          {icon}
        </div>
      )}

      <h3 className='text-[17px] font-medium leading-snug tracking-[-0.011em] text-primary-token'>
        {title}
      </h3>
      <p className='mt-2 text-[14px] leading-relaxed text-secondary-token'>
        {description}
      </p>
    </div>
  );
}
