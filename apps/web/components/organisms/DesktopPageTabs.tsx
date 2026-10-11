'use client';

import { useEffect, useRef } from 'react';
import {
  getRawElectronAPI,
  useDesktopPageTabs,
} from '@/lib/desktop/electron-bridge';
import { DesktopPageTabsView } from './DesktopPageTabsView';

/** Measures the main-column boundary for the independent native chrome view. */
export function DesktopPageTabs() {
  const { state, command } = useDesktopPageTabs();
  const mount = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const api = getRawElectronAPI();
    if (!api?.setPageTabsBounds || !mount.current) return;
    const element = mount.current;
    const report = () => {
      const rect = element.getBoundingClientRect();
      api.setPageTabsBounds?.({
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        dark: document.documentElement.classList.contains('dark'),
        ov: Boolean(
          element.closest('.ov-mode') ||
            element
              .closest('[data-app-shell-frame]')
              ?.querySelector('#shell-left-rail.ov-mode')
        ),
      });
    };
    const resize = new ResizeObserver(report);
    const theme = new MutationObserver(report);
    resize.observe(element);
    theme.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });
    const rail = element
      .closest('[data-app-shell-frame]')
      ?.querySelector('#shell-left-rail');
    if (rail)
      theme.observe(rail, { attributes: true, attributeFilter: ['class'] });
    report();
    return () => {
      resize.disconnect();
      theme.disconnect();
    };
  }, []);
  return (
    <div ref={mount} data-electron-tabs-mount='true'>
      <DesktopPageTabsView
        // The native view owns the only interactive/accessible strip. Hosted
        // pages reserve its slot without hidden duplicate keyboard controls.
        state={getRawElectronAPI()?.setPageTabsBounds ? null : state}
        command={command}
        panelId='main-content'
      />
    </div>
  );
}
