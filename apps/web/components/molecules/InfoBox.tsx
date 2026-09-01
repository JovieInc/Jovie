import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import {
  INFOBOX_CONTENT_GEOMETRY_CLASS,
  INFOBOX_INLINE_GEOMETRY_CLASS,
  INFOBOX_INLINE_SEMANTIC_SURFACE,
  INFOBOX_SEMANTIC_FOREGROUND,
  INFOBOX_SEMANTIC_SURFACE,
  INFOBOX_SHARED_GEOMETRY_CLASS,
  INFOBOX_TITLE_GEOMETRY_CLASS,
} from './info-box-semantic-contract';

interface InfoBoxProps {
  readonly title?: string;
  readonly variant?: 'info' | 'warning' | 'success' | 'error';
  readonly presentation?: 'box' | 'inline';
  readonly children: ReactNode;
  readonly className?: string;
  readonly testId?: string;
}

export function InfoBox({
  title,
  variant = 'info',
  presentation = 'box',
  children,
  className,
  testId,
}: InfoBoxProps) {
  const isInline = presentation === 'inline';
  const geometryClassName = isInline
    ? INFOBOX_INLINE_GEOMETRY_CLASS
    : INFOBOX_SHARED_GEOMETRY_CLASS;
  const semanticSurfaceClassName = isInline
    ? INFOBOX_INLINE_SEMANTIC_SURFACE[variant]
    : INFOBOX_SEMANTIC_SURFACE[variant];

  return (
    <div
      role={variant === 'error' ? 'alert' : 'status'}
      aria-live={variant === 'error' ? 'assertive' : 'polite'}
      data-presentation={presentation}
      data-testid={testId}
      data-variant={variant}
      className={cn(geometryClassName, className, semanticSurfaceClassName)}
    >
      {title && (
        <h3
          className={cn(
            INFOBOX_TITLE_GEOMETRY_CLASS,
            INFOBOX_SEMANTIC_FOREGROUND[variant]
          )}
        >
          {title}
        </h3>
      )}
      <div
        className={cn(
          INFOBOX_CONTENT_GEOMETRY_CLASS,
          INFOBOX_SEMANTIC_FOREGROUND[variant]
        )}
      >
        {children}
      </div>
    </div>
  );
}
