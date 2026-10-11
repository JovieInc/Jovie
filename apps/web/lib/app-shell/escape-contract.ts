export type HudPresentation = 'canonical-app-shell' | 'kiosk';

export type ShellEscapeControl = 'none';

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

  return {
    presentation: 'kiosk',
    ownerShell: 'isolated',
    visibleControl: 'none',
    keyboard: [],
    backTarget: null,
    globalDropdownIsPrimaryExit: false,
  };
}
