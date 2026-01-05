import type { ButtonHTMLAttributes } from 'react';
import { ButtonSpinner } from '../ButtonSpinner';

interface LoadingButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /**
   * Whether the button is in a loading state
   */
  isLoading: boolean;
  /**
   * Optional text to show while loading (defaults to children)
   */
  loadingText?: string;
  /**
   * Button content
   */
  children: React.ReactNode;
}

/**
 * Button component with loading state support.
 * Shows spinner and optional loading text when isLoading is true.
 */
export function LoadingButton({
  isLoading,
  loadingText,
  children,
  ...props
}: LoadingButtonProps) {
  return (
    <button {...props} aria-busy={isLoading}>
      {isLoading ? (
        <>
          <ButtonSpinner />
          <span>{loadingText || children}</span>
        </>
      ) : (
        children
      )}
    </button>
  );
}
