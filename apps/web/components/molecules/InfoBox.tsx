import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import {
  INFOBOX_CONTENT_GEOMETRY_CLASS,
  INFOBOX_SEMANTIC_FOREGROUND,
  INFOBOX_SEMANTIC_SURFACE,
  INFOBOX_SHARED_GEOMETRY_CLASS,
  INFOBOX_TITLE_GEOMETRY_CLASS,
} from './info-box-semantic-contract';

interface InfoBoxProps {
  readonly title?: string;
  readonly variant?: 'info' | 'warning' | 'success' | 'error';
  readonly children: ReactNode;
  readonly className?: string;
}

export function InfoBox({
  title,
  variant = 'info',
  children,
  className,
}: InfoBoxProps) {
  return (
    <div
      className={cn(
        INFOBOX_SHARED_GEOMETRY_CLASS,
        INFOBOX_SEMANTIC_SURFACE[variant],
        className
      )}
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
