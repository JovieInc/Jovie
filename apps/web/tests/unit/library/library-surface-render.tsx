import { TooltipProvider } from '@jovie/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { LibrarySurface } from '@/app/app/(shell)/library/LibrarySurface';
import type { LibraryReleaseAsset } from '@/app/app/(shell)/library/library-data';
import { HeaderSearchSurfaceFromContext } from '@/components/shell/HeaderSearchSurfaceFromContext';
import { HeaderActionsProvider } from '@/contexts/HeaderActionsContext';
import {
  RightPanelProvider,
  useRightPanel,
} from '@/contexts/RightPanelContext';
import {
  ShellSidebarOverrideProvider,
  useShellSidebarOverride,
} from '@/contexts/ShellSidebarOverrideContext';

export function RightPanelOutlet() {
  return useRightPanel();
}

export function renderLibraryWithHeader(
  assets: readonly LibraryReleaseAsset[]
) {
  return render(
    <TooltipProvider>
      <RightPanelProvider>
        <HeaderActionsProvider>
          <HeaderSearchSurfaceFromContext />
          <LibrarySurface assets={assets} />
          <RightPanelOutlet />
        </HeaderActionsProvider>
      </RightPanelProvider>
    </TooltipProvider>
  );
}

export function renderLibrary(
  assets: readonly LibraryReleaseAsset[],
  props: Partial<ComponentProps<typeof LibrarySurface>> = {}
) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <TooltipProvider>
        <RightPanelProvider>
          <LibrarySurface assets={assets} {...props} />
          <RightPanelOutlet />
        </RightPanelProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

function SidebarOverrideProbe() {
  const override = useShellSidebarOverride();

  return (
    <output
      aria-label='Sidebar override contract'
      data-testid='library-sidebar-override'
      data-back-href={override?.backHref}
      data-back-label={override?.backLabel}
      data-key={override?.key}
    >
      {override?.content ? 'registered' : 'missing'}
    </output>
  );
}

export function renderLibraryWithSidebarProbe(
  assets: readonly LibraryReleaseAsset[]
) {
  return render(
    <TooltipProvider>
      <RightPanelProvider>
        <ShellSidebarOverrideProvider>
          <LibrarySurface assets={assets} />
          <SidebarOverrideProbe />
          <RightPanelOutlet />
        </ShellSidebarOverrideProvider>
      </RightPanelProvider>
    </TooltipProvider>
  );
}
