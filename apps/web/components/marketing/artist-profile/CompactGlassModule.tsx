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
 * The audience-pill material at module scale; shares captureShared.css as the
 * single material owner with `.artist-profile-audience-pill`.
 */
export function CompactGlassModule({
  label,
  children,
  className,
}: Readonly<CompactGlassModuleProps>) {
  return (
    <div className={cn('compact-glass-module', className)}>
      {label ? (
        <span className='compact-glass-module__label'>{label}</span>
      ) : null}
      {children}
    </div>
  );
}
