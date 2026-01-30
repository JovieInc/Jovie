import { cn } from '@/lib/utils';

export type DividerProps = {
  readonly className?: string;
  readonly inset?: boolean; // adds horizontal padding inset for alignment with content
  readonly orientation?: 'horizontal' | 'vertical';
  readonly ariaHidden?: boolean; // hide from assistive tech when decorative
};

// Divider aligning with our border tokens
export function Divider({
  className,
  inset = false,
  orientation = 'horizontal',
  ariaHidden,
}: DividerProps) {
  const isHorizontal = orientation === 'horizontal';
  const sizeStyles = isHorizontal
    ? { width: '100%', height: '1px' }
    : { width: '1px', height: '100%' };

  return (
    // biome-ignore lint/a11y/useAriaPropsSupportedByRole: aria-orientation is needed for separator role accessibility
    <div
      role={ariaHidden ? undefined : 'separator'}
      aria-hidden={ariaHidden}
      aria-orientation={ariaHidden ? undefined : orientation}
      style={sizeStyles}
      className={cn(
        isHorizontal ? 'border-t' : 'border-l',
        'border-subtle',
        inset && 'mx-3',
        className
      )}
    />
  );
}
