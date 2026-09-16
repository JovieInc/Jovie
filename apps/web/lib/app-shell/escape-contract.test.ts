import { describe, expect, it } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
import {
  resolveHudEscapeContract,
  resolveHudPresentation,
} from './escape-contract';

describe('HUD escape contract', () => {
  it('keeps default /hud inside the OV app shell with no orphan exit', () => {
    const presentation = resolveHudPresentation({});
    const contract = resolveHudEscapeContract(presentation);

    expect(presentation).toBe('canonical-app-shell');
    expect(contract.ownerShell).toBe('ov');
    expect(contract.globalDropdownIsPrimaryExit).toBe(false);
    expect(contract.backTarget).toBeNull();
    expect(contract.visibleControl).toBe('none');
  });

  it('gives isolated fullscreen a visible Exit control and Escape', () => {
    const presentation = resolveHudPresentation({ fs: '1' });
    const contract = resolveHudEscapeContract(presentation);

    expect(presentation).toBe('isolated-fullscreen');
    expect(contract.visibleControl).toBe('exit-fullscreen');
    expect(contract.keyboard).toEqual(['Escape']);
    expect(contract.backTarget).toBe(APP_ROUTES.HUD);
    expect(contract.globalDropdownIsPrimaryExit).toBe(false);
  });

  it('gives packaged Mac HUD a Close path back to canonical /hud', () => {
    const presentation = resolveHudPresentation({ ovie: 'mac' });
    const contract = resolveHudEscapeContract(presentation);

    expect(presentation).toBe('packaged-mac-hud');
    expect(contract.visibleControl).toBe('close');
    expect(contract.keyboard).toEqual(['Escape']);
    expect(contract.backTarget).toBe(APP_ROUTES.HUD);
    expect(contract.globalDropdownIsPrimaryExit).toBe(false);
  });

  it('does not treat kiosk as an orphan that exits through a global dropdown', () => {
    const contract = resolveHudEscapeContract(
      resolveHudPresentation({ kiosk: 'token' })
    );

    expect(contract.presentation).toBe('kiosk');
    expect(contract.globalDropdownIsPrimaryExit).toBe(false);
    expect(contract.visibleControl).toBe('none');
  });
});
