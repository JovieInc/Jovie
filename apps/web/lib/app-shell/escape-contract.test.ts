import { describe, expect, it } from 'vitest';
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

  it('keeps legacy fs=1 inside the canonical app shell', () => {
    const presentation = resolveHudPresentation({ fs: '1' });
    const contract = resolveHudEscapeContract(presentation);

    expect(presentation).toBe('canonical-app-shell');
    expect(contract.ownerShell).toBe('ov');
    expect(contract.visibleControl).toBe('none');
    expect(contract.keyboard).toEqual([]);
    expect(contract.backTarget).toBeNull();
    expect(contract.globalDropdownIsPrimaryExit).toBe(false);
  });

  it('keeps the packaged Mac entry inside the canonical shell', () => {
    const presentation = resolveHudPresentation({ ovie: 'mac' });
    const contract = resolveHudEscapeContract(presentation);

    expect(presentation).toBe('canonical-app-shell');
    expect(contract.ownerShell).toBe('ov');
    expect(contract.visibleControl).toBe('none');
    expect(contract.keyboard).toEqual([]);
    expect(contract.backTarget).toBeNull();
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
