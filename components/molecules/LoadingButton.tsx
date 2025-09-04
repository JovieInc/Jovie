import { LoadingSpinner } from '@/components/atoms/LoadingSpinner';
import { Button, ButtonProps } from '@/components/ui/Button';

// Trigger CI run to resolve check suite failures

interface LoadingButtonProps extends ButtonProps {
  isLoading?: boolean;
  loadingText?: string;
  spinnerSize?: 'xs' | 'sm' | 'md' | 'lg';
  spinnerVariant?: 'light' | 'dark' | 'auto';
  children: React.ReactNode;
}

export function LoadingButton({
  isLoading = false,
  loadingText,
  spinnerSize = 'sm',
  spinnerVariant,
  children,
  disabled,
  variant,
  ...props
}: LoadingButtonProps) {
  // Determine spinner variant based on button variant if not explicitly provided
  // For dark buttons, use light spinner (white)
  // For light buttons, use dark spinner (indigo)
  const defaultSpinnerVariant = variant === 'primary' ? 'light' : 'dark';

  const effectiveSpinnerVariant = spinnerVariant || defaultSpinnerVariant;

  return (
    <Button disabled={disabled || isLoading} variant={variant} {...props}>
      {/* Cross-fade label/spinner without layout shift */}
      <div className='relative flex min-h-[1.5rem] items-center justify-center'>
        <span
          className={`transition-opacity duration-200 ${isLoading ? 'opacity-0' : 'opacity-100'}`}
        >
          {children}
        </span>
        <span
          className={`absolute inset-0 flex items-center justify-center transition-opacity duration-200 ${isLoading ? 'opacity-100' : 'opacity-0'}`}
        >
          <span className='inline-flex items-center gap-2'>
            <LoadingSpinner
              size={spinnerSize}
              variant={effectiveSpinnerVariant}
            />
            <span>{loadingText || 'Loading...'}</span>
          </span>
        </span>
      </div>
    </Button>
  );
}
