import { cn } from '@/lib/utils';

export interface MarketingSectionIntroBadge {
  readonly label: string;
  readonly testId?: string;
}

export interface MarketingSectionIntroProps {
  readonly eyebrow: string;
  readonly title: string;
  readonly titleId?: string;
  readonly titleClassName?: string;
  readonly description: React.ReactNode;
  readonly descriptionClassName?: string;
  readonly badges?: readonly MarketingSectionIntroBadge[];
  readonly aside?: React.ReactNode;
  readonly className?: string;
  readonly copyClassName?: string;
  readonly asideClassName?: string;
}

export function MarketingSectionIntro({
  eyebrow,
  title,
  titleId,
  titleClassName,
  description,
  descriptionClassName,
  badges,
  aside,
  className,
  copyClassName,
  asideClassName,
}: Readonly<MarketingSectionIntroProps>) {
  return (
    <div className={cn('homepage-section-intro', className)}>
      <div className={cn('homepage-section-copy', copyClassName)}>
        <p className='homepage-section-eyebrow'>{eyebrow}</p>
        <h2
          id={titleId}
          className={cn(
            'marketing-h2-linear mt-5 text-primary-token',
            titleClassName
          )}
        >
          {title}
        </h2>
        <div
          className={cn(
            'mt-4 max-w-[34rem] text-[15px] leading-[1.65] text-secondary-token sm:text-[16px]',
            descriptionClassName
          )}
        >
          {description}
        </div>

        {badges?.length ? (
          <div className='mt-5 flex flex-wrap gap-2.5'>
            {badges.map(badge => (
              <span
                key={badge.label}
                data-testid={badge.testId}
                className='inline-flex items-center rounded-full border border-subtle bg-surface-1 px-3 py-1.5 text-[12px] font-medium tracking-[-0.01em] text-secondary-token'
              >
                {badge.label}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      {aside ? <div className={asideClassName}>{aside}</div> : null}
    </div>
  );
}
