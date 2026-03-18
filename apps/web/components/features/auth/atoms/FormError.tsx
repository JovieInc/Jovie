import { AUTH_CLASSES } from '@/lib/auth/constants';
import { cn } from '@/lib/utils';

interface FormErrorProps {
  /**
   * Error message to display
   */
  readonly message?: string | null;
  /**
   * Optional CSS class names
   */
  readonly className?: string;
  /**
   * Optional error ID for aria-describedby
   */
  readonly id?: string;
}

/**
 * Standardized error message component for auth forms.
 * Includes proper ARIA attributes and consistent styling.
 */
export function FormError({
  message,
  className,
  id,
}: Readonly<FormErrorProps>) {
  if (!message) return null;

  return (
    <p
      id={id}
      className={cn(AUTH_CLASSES.fieldError, className)}
      role='alert'
      aria-live='polite'
    >
      {message}
    </p>
  );
}
