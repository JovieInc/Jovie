import type { ComponentProps, CSSProperties } from 'react';
import { cn } from '@/lib/utils';

/** Decoration owns no action or focus. The enclosing control retains both. */
export function IconGlyphFrame({
  hoverSurface,
  className,
  style,
  ...props
}: ComponentProps<'span'> & { readonly hoverSurface?: string }) {
  return (
    <span
      {...props}
      data-icon-glyph='true'
      className={cn(
        'icon-glyph inline-flex size-7 shrink-0 items-center justify-center rounded-full',
        className
      )}
      style={
        {
          ...style,
          '--icon-glyph-hover-surface': hoverSurface,
        } as CSSProperties
      }
    />
  );
}
