import type { ReactNode } from 'react';
import { BrandLogo } from '@/components/atoms/BrandLogo';
import { BRAND_MARK_SIZE } from '@/lib/brand/tokens';

interface MacCinematicSurfaceProps {
  readonly children: ReactNode;
  readonly state: string;
  readonly testId: string;
  readonly shellKind?: string;
}

/** Visual shell for the native handoff. The browser still owns credential entry. */
export function MacCinematicSurface({
  children,
  state,
  testId,
  shellKind,
}: MacCinematicSurfaceProps) {
  return (
    <main
      className='relative isolate grid min-h-dvh place-items-center overflow-hidden bg-(--color-bg-base) px-6 text-primary-token [color-scheme:dark]'
      data-desktop-auth-state={state}
      data-auth-shell-kind={shellKind}
      data-testid={testId}
      data-mac-cinematic-shell='auth-handoff'
    >
      <div
        aria-hidden
        className='pointer-events-none absolute inset-0'
        style={{
          backgroundImage:
            'radial-gradient(ellipse 95% 42% at 82% -7%, color-mix(in oklab, var(--color-accent) 32%, transparent), transparent 70%), radial-gradient(ellipse 60% 35% at 50% -10%, color-mix(in oklab, var(--color-accent) 20%, transparent), transparent 75%)',
        }}
      />
      <div
        aria-hidden
        className='pointer-events-none absolute inset-0'
        style={{
          backgroundImage:
            'radial-gradient(ellipse 85% 90% at 50% 46%, transparent 55%, color-mix(in oklab, var(--color-bg-base) 70%, transparent) 100%)',
        }}
      />
      <div
        data-mac-corner-mark
        className='pointer-events-none absolute top-8 right-8 opacity-[0.35]'
        aria-hidden
      >
        <BrandLogo
          aria-hidden
          size={BRAND_MARK_SIZE.chrome}
          tone='white'
          rounded={false}
        />
      </div>
      {children}
    </main>
  );
}
