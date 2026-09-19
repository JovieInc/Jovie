import { APP_ROUTES } from '@/constants/routes';

export type HudPresentation =
  | 'canonical-app-shell'
  | 'isolated-fullscreen'
  | 'kiosk'
  | 'packaged-mac-hud';

export type ShellEscapeControl = 'none' | 'exit-fullscreen' | 'close';

export interface HudSearchParams {
  readonly fs?: string | null;
  readonly kiosk?: string | null;
  readonly ovie?: string | null;
  readonly mode?: string | null;
}

export interface ShellEscapeContract {
  readonly presentation: HudPresentation;
  readonly ownerShell: 'ov' | 'isolated';
  readonly visibleControl: ShellEscapeControl;
  readonly keyboard: readonly string[];
  readonly backTarget: string | null;
  readonly globalDropdownIsPrimaryExit: false;
}

export function resolveHudPresentation(
  search: HudSearchParams
): HudPresentation {
  if (search.kiosk || search.mode === 'kiosk') return 'kiosk';
  if (search.ovie === 'mac') return 'packaged-mac-hud';
  if (search.fs === '1') return 'isolated-fullscreen';
  return 'canonical-app-shell';
}

export function resolveHudEscapeContract(
  presentation: HudPresentation
): ShellEscapeContract {
  if (presentation === 'canonical-app-shell') {
    return {
      presentation,
      ownerShell: 'ov',
      visibleControl: 'none',
      keyboard: [],
      backTarget: null,
      globalDropdownIsPrimaryExit: false,
    };
  }

  if (presentation === 'isolated-fullscreen') {
    return {
      presentation,
      ownerShell: 'isolated',
      visibleControl: 'exit-fullscreen',
      keyboard: ['Escape'],
      backTarget: APP_ROUTES.HUD,
      globalDropdownIsPrimaryExit: false,
    };
  }

  if (presentation === 'packaged-mac-hud') {
    return {
      presentation,
      ownerShell: 'isolated',
      visibleControl: 'close',
      keyboard: ['Escape'],
      backTarget: APP_ROUTES.HUD,
      globalDropdownIsPrimaryExit: false,
    };
  }

  return {
    presentation: 'kiosk',
    ownerShell: 'isolated',
    visibleControl: 'none',
    keyboard: [],
    backTarget: null,
    globalDropdownIsPrimaryExit: false,
  };
}
