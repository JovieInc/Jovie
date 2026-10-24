import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import './captureShared.css';

export interface CompactGlassModuleProps {
  /** Small uppercase module label; omitted when there is no new information. */
  readonly label?: string;
  readonly children: ReactNode;
  readonly className?: string;
}

/**
 * Compact glass module (JOV-6248) — marketing presentation variant of the
 * `compact-glass` media recipe approved in JOV-6246 (reference #23).
 * Geometry lives in captureShared.css; ds-glass is the single material owner.
 */
export function CompactGlassModule({
  label,
  children,
  className,
}: Readonly<CompactGlassModuleProps>) {
  return (
    <div className={cn('compact-capture-module ds-glass', className)}>
      {label ? (
        <span className='compact-capture-module__label'>{label}</span>
      ) : null}
      {children}
    </div>
  );
}
