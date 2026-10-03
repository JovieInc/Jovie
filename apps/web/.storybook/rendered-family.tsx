import '../styles/system-b-app.css';
import { useTheme } from 'next-themes';
import { type ReactNode, useEffect, useRef } from 'react';
import { useSidebar } from '@/components/organisms/sidebar';

const variant = (interactive: boolean, radius = '--radius-none') => ({
  'data-jovie-eval-variant': 'current-story',
  'data-jovie-eval-target': 'true',
  'data-jovie-eval-tone': 'neutral',
  'data-jovie-eval-padding-x': '--space-0',
  'data-jovie-eval-padding-y': '--space-0',
  'data-jovie-eval-radius': radius,
  'data-jovie-eval-interactive': String(interactive),
});

const family = (
  name: string,
  owner: string,
  theme: string,
  surface: string
) => ({
  'data-jovie-eval-family': name,
  'data-jovie-eval-owner': owner,
  'data-jovie-eval-theme': theme,
  'data-jovie-eval-surface-token': surface,
  'data-jovie-eval-mapping': JSON.stringify({ 'current-story': 'neutral' }),
});

/** Declare expectations; the canonical browser evaluator measures the real DOM. */
export function RenderedFamily({
  name,
  owner,
  interactive,
  children,
}: {
  name: string;
  owner: string;
  interactive: boolean;
  children: ReactNode;
}) {
  const { resolvedTheme } = useTheme();
  return (
    <div
      className='w-full min-w-0 bg-base'
      {...family(name, owner, resolvedTheme ?? '', '--color-bg-base')}
    >
      <div {...variant(interactive)}>{children}</div>
    </div>
  );
}

/** Keep mobile evidence on the actual portalled drawer, inside its focus trap. */
export function RenderedSidebarFamily({
  name,
  owner,
  children,
}: {
  name: string;
  owner: string;
  children: ReactNode;
}) {
  const { resolvedTheme } = useTheme();
  const { isMobile, setOpenMobile } = useSidebar();
  const frame = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (isMobile) setOpenMobile(true);
    const marked = new Set<HTMLElement>();
    const mark = () => {
      const target = isMobile
        ? document.querySelector<HTMLElement>(
            '[data-sidebar="sidebar"][data-mobile="true"]'
          )
        : frame.current?.querySelector<HTMLElement>('[data-sidebar="sidebar"]');
      if (
        target
          ?.getAnimations()
          .some(animation => animation.playState === 'running')
      ) {
        target.addEventListener('animationend', mark, { once: true });
        target.addEventListener('transitionend', mark, { once: true });
        return;
      }
      const root = isMobile ? target : frame.current;
      const content = isMobile ? target?.firstElementChild : target;
      if (!root || !(content instanceof HTMLElement)) return;
      for (const [key, value] of Object.entries(
        family(
          name,
          owner,
          resolvedTheme ?? '',
          isMobile ? '--app-shell-sidebar-background' : '--color-bg-base'
        )
      ))
        root.setAttribute(key, value);
      for (const [key, value] of Object.entries(
        variant(true, isMobile ? '--radius-none' : '--app-shell-radius')
      ))
        content.setAttribute(key, value);
      marked.add(root);
      marked.add(content);
    };
    mark();
    const observer = new MutationObserver(mark);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      for (const element of marked)
        for (const attribute of [...element.attributes])
          if (attribute.name.startsWith('data-jovie-eval-'))
            element.removeAttribute(attribute.name);
    };
  }, [isMobile, name, owner, resolvedTheme, setOpenMobile]);
  return (
    <div
      ref={frame}
      className='h-full w-(--app-shell-sidebar-width) shrink-0 bg-base'
    >
      {children}
    </div>
  );
}
