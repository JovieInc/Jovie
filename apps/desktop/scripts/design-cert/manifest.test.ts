import { describe, expect, it } from 'vitest';
import { APP_SCREEN_REGISTRY } from '../../../web/data/appScreens/registry';
import {
  DESKTOP_DESIGN_CERT_MANIFEST,
  DESKTOP_DESIGN_CERT_SLICES,
  DESKTOP_DESIGN_SCREENS,
  getDesktopDesignScreenForState,
  getDesktopDesignState,
} from './manifest';

describe('desktop design certification manifest', () => {
  it('derives the complete renderer route inventory from the closed-world app registry', () => {
    const rendererRoutes = DESKTOP_DESIGN_SCREENS.filter(
      screen =>
        screen.layer === 'renderer-route' && screen.id.startsWith('screen.')
    );

    expect(DESKTOP_DESIGN_CERT_MANIFEST.routeCount).toBe(94);
    expect(rendererRoutes.map(screen => screen.route)).toEqual(
      APP_SCREEN_REGISTRY.map(screen => screen.route)
    );
  });

  it('enumerates the requested meaningful state classes and desktop-only surfaces', () => {
    const stateKinds = new Set(
      DESKTOP_DESIGN_SCREENS.flatMap(screen =>
        screen.states.map(state => state.kind)
      )
    );
    expect(stateKinds).toEqual(
      new Set([
        'default',
        'loading',
        'empty',
        'error',
        'disabled',
        'focus',
        'hover',
        'navigation',
        'auth',
        'recovery',
        'overlay',
        'liveness',
      ])
    );
    expect(DESKTOP_DESIGN_SCREENS.map(screen => screen.id)).toEqual(
      expect.arrayContaining([
        'desktop.shell',
        'desktop.ovie',
        'desktop.auth-handoff',
        'desktop.renderer-recovery',
      ])
    );
  });

  it('gives every state an owner, next proof, and enforceable invariants', () => {
    for (const screen of DESKTOP_DESIGN_SCREENS) {
      for (const state of screen.states) {
        expect(state.owner, state.id).not.toBe('');
        expect(state.nextProof, state.id).not.toBe('');
        expect(state.invariants.length, state.id).toBeGreaterThan(0);
        if (state.nonterminal && ['error', 'recovery'].includes(state.kind)) {
          expect(state.invariants, state.id).toContain('named-recovery-action');
        }
      }
    }
  });

  it('pins Ovie to the in-shell route with reversible fullscreen coverage', () => {
    const ovie = DESKTOP_DESIGN_SCREENS.find(
      screen => screen.id === 'desktop.ovie'
    );
    expect(ovie?.route).toBe('/app/ov/ops?ovie=mac');
    expect(
      getDesktopDesignScreenForState('desktop.ovie.metrics-unavailable')?.route
    ).toBe('/app/ov/ops?ovie=mac');
    expect(
      getDesktopDesignState('desktop.ovie.metrics-unavailable')?.label
    ).toBe('founder financial and growth inputs unavailable');
    expect(
      getDesktopDesignState('desktop.ovie.metrics-unavailable')?.trigger
    ).toMatch(/shipping telemetry may remain independently available/i);
    expect(
      getDesktopDesignState('desktop.ovie.in-shell')?.invariants
    ).toContain('app-shell-present');
    expect(
      getDesktopDesignState('desktop.ovie.fullscreen')?.invariants
    ).toEqual(
      expect.arrayContaining([
        'app-chrome-hidden',
        'same-route-fullscreen',
        'available-destination',
      ])
    );
    expect(
      getDesktopDesignState('desktop.ovie.fullscreen-exit')?.invariants
    ).toContain('app-shell-present');

    const nonterminalOvieStates = ovie?.states.filter(
      state => state.nonterminal
    );
    expect(nonterminalOvieStates?.length).toBeGreaterThan(0);
    for (const state of nonterminalOvieStates ?? []) {
      expect(state.invariants, state.id).toContain('available-destination');
    }
  });

  it('starts with one bounded Ovie slice and names its expansion gate', () => {
    const first = DESKTOP_DESIGN_CERT_SLICES[0];
    expect(first.id).toBe('slice-01-ovie-unavailable');
    expect(first.stateIds).toEqual(['desktop.ovie.metrics-unavailable']);
    expect(first.expansionGate).toMatch(/exact local bundle/i);
    expect(getDesktopDesignState(first.stateIds[0])).toBeDefined();
  });
});
