import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

export interface LabelProps
  extends React.LabelHTMLAttributes<HTMLLabelElement> {
  readonly htmlFor: string;
  readonly className?: string;
  readonly children: React.ReactNode;
  readonly required?: boolean;
}

export const Label = forwardRef<HTMLLabelElement, LabelProps>(
  ({ className, children, required = false, ...props }, ref) => {
    return (
      // biome-ignore lint/a11y/noLabelWithoutControl: Generic label component - htmlFor is passed via props
      <label
        ref={ref}
        className={cn(
          'text-sm font-medium leading-none',
          'text-secondary-token',
          'mb-1 block',
          required && "after:content-['*'] after:ml-0.5 after:text-destructive",
          className
        )}
        {...props}
      >
        {children}
      </label>
    );
  }
);

Label.displayName = 'Label';
