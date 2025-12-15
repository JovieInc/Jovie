import { Check } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Card } from '@/components/molecules/Card';
import { cn } from '@/lib/utils';

export type PricingTierCardCtaVariant = 'primary' | 'outline';

export interface PricingTierCardProps {
  name: string;
  description: string;
  price: string;
  period: string;
  ctaHref: string;
  ctaLabel: string;
  ctaVariant?: PricingTierCardCtaVariant;
  features: readonly string[];
  highlighted?: boolean;
  footer?: ReactNode;
  className?: string;
}

export function PricingTierCard({
  name,
  description,
  price,
  period,
  ctaHref,
  ctaLabel,
  ctaVariant = 'outline',
  features,
  highlighted = false,
  footer,
  className,
}: PricingTierCardProps) {
  return (
    <Card
      className={cn(
        'flex flex-col p-8',
        highlighted && 'border-2 border-default',
        className
      )}
    >
      <div className='mb-4'>
        <h2
          className={cn(
            'text-xs font-medium uppercase tracking-wide',
            highlighted ? 'text-primary-token' : 'text-secondary-token'
          )}
        >
          {name}
        </h2>
      </div>

      <p className='mb-4 text-sm text-secondary-token'>{description}</p>

      <div className='mb-6 flex items-baseline'>
        <span className='text-4xl font-semibold text-primary-token'>
          {price}
        </span>
        <span className='ml-2 text-secondary-token'>{period}</span>
      </div>

      <Link
        href={ctaHref}
        className={cn(
          'btn btn-md mb-6 w-full',
          ctaVariant === 'primary'
            ? 'btn-primary hover:opacity-90'
            : 'border border-subtle bg-base text-primary-token hover:bg-surface-2'
        )}
      >
        {ctaLabel}
      </Link>

      <ul className='grow space-y-3' aria-label={`${name} features`}>
        {features.map(feature => (
          <li key={feature} className='flex items-start gap-3'>
            <Check
              className={cn(
                'h-4 w-4 mt-0.5 shrink-0',
                highlighted ? 'text-primary-token' : 'text-tertiary-token'
              )}
              aria-hidden='true'
            />
            <span
              className={cn(
                'text-sm',
                highlighted ? 'text-primary-token' : 'text-secondary-token'
              )}
            >
              {feature}
            </span>
          </li>
        ))}
      </ul>

      {footer ? (
        <div className='mt-8 border-t border-subtle pt-6'>{footer}</div>
      ) : null}
    </Card>
  );
}
