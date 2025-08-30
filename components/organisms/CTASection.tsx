import { CTAButton } from '@/components/atoms/CTAButton';
import { SectionHeading } from '@/components/atoms/SectionHeading';

export interface CTASectionProps {
  title: React.ReactNode;
  buttonText: string;
  buttonHref: string;
  description?: React.ReactNode;
  variant?: 'primary' | 'secondary';
  className?: string;
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
      'border-t border-white/10 dark:border-white/10 bg-white dark:bg-black',
    secondary: 'bg-zinc-900 text-white',
  };

  return (
    <section
      aria-labelledby='cta-heading'
      className={`${variantClasses[variant]} ${className}`}
    >
      <div className='mx-auto max-w-7xl px-6 py-10 md:py-14 flex flex-col md:flex-row items-center justify-between gap-6'>
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

        <div className='flex items-center gap-3'>
          <CTAButton
            href={buttonHref}
            variant={variant === 'secondary' ? 'secondary' : 'primary'}
            size={variant === 'secondary' ? 'lg' : 'md'}
          >
            {buttonText}
          </CTAButton>
        </div>
      </div>
    </section>
  );
}
