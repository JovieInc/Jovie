import Link from 'next/link';
import {
  type ComponentPropsWithoutRef,
  type CSSProperties,
  forwardRef,
} from 'react';
import { cn } from '@/lib/utils';

interface LinearButtonProps
  extends Omit<ComponentPropsWithoutRef<'a'>, 'href'> {
  readonly variant?: 'primary' | 'secondary' | 'ghost';
  readonly href: string;
  readonly children: React.ReactNode;
}

const VARIANT_STYLES: Record<
  'primary' | 'secondary' | 'ghost',
  { className: string; style: CSSProperties }
> = {
  primary: {
    className: 'h-10 px-5 hover:opacity-90',
    style: {
      backgroundColor: 'var(--linear-btn-primary-bg)',
      color: 'var(--linear-btn-primary-fg)',
      borderRadius: 'var(--linear-radius-sm)',
      fontSize: 'var(--linear-body-sm-size)',
      fontWeight: 'var(--linear-font-weight-medium)',
    },
  },
  secondary: {
    className: 'h-10 px-4 hover:opacity-80',
    style: {
      backgroundColor: 'transparent',
      color: 'var(--linear-text-secondary)',
      borderRadius: 'var(--linear-radius-sm)',
      fontSize: 'var(--linear-body-sm-size)',
      fontWeight: 'var(--linear-font-weight-medium)',
      border: '1px solid transparent',
    },
  },
  ghost: {
    className: 'h-10 px-0 gap-1.5',
    style: {
      backgroundColor: 'transparent',
      color: 'var(--linear-text-secondary)',
      fontSize: 'var(--linear-body-sm-size)',
      fontWeight: 'var(--linear-font-weight-medium)',
    },
  },
};

export const LinearButton = forwardRef<HTMLAnchorElement, LinearButtonProps>(
  (
    { variant = 'primary', href, children, className, style, ...props },
    ref
  ) => {
    const variantConfig = VARIANT_STYLES[variant];

    return (
      <Link
        ref={ref}
        href={href}
        className={cn(
          'focus-ring-themed inline-flex items-center justify-center transition-all duration-150',
          variantConfig.className,
          className
        )}
        style={{ ...variantConfig.style, ...style }}
        {...props}
      >
        {children}
      </Link>
    );
  }
);

LinearButton.displayName = 'LinearButton';
