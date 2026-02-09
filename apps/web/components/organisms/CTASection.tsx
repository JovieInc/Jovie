import { SectionHeading } from '@/components/atoms/SectionHeading';
import { CTAButton } from '@/components/ui/CTAButton';

export interface CTASectionProps {
  readonly title: React.ReactNode;
  readonly buttonText: string;
  readonly buttonHref: string;
  readonly description?: React.ReactNode;
  readonly variant?: 'primary' | 'secondary';
  readonly className?: string;
}

export function CTASection({
  title,
  buttonText,
  buttonHref,
  description,
  variant = 'primary',
  className = '',
}: CTASectionProps) {
  const variantClasses = {
    primary:
      'border-t border-subtle bg-white dark:bg-black',
    secondary: 'bg-zinc-900 text-white',
  };

  return (
    <section
      aria-labelledby='cta-heading'
      className={`${variantClasses[variant]} ${className}`}
    >
      <div className='mx-auto max-w-7xl px-6 py-10 md:py-14 flex flex-col gap-6 md:flex-row md:items-center md:justify-between'>
        <div className={variant === 'secondary' ? 'text-center space-y-4' : ''}>
          <SectionHeading
            id='cta-heading'
            level={2}
            size={variant === 'secondary' ? 'xl' : 'md'}
            align={variant === 'secondary' ? 'center' : 'left'}
            className={
              variant === 'secondary'
                ? 'text-white'
                : 'text-neutral-800 dark:text-white'
            }
          >
            {title}
          </SectionHeading>
          {description && (
            <p
              className={`text-lg sm:text-xl leading-relaxed ${
                variant === 'secondary'
                  ? 'text-white'
                  : 'text-gray-600 dark:text-gray-300'
              }`}
            >
              {description}
            </p>
          )}
        </div>

        <div className='flex w-full flex-col gap-3 md:w-auto md:flex-row md:items-center md:justify-end'>
          <CTAButton
            href={buttonHref}
            variant={variant === 'secondary' ? 'secondary' : 'primary'}
            size={variant === 'secondary' ? 'lg' : 'default'}
            className='w-full md:w-auto'
          >
            {buttonText}
          </CTAButton>
        </div>
      </div>
    </section>
  );
}
