import { describe, expect, it } from 'vitest';
import {
  HERO_DECISION_TABLE,
  HERO_PEN_ID_BY_VARIANT,
  HERO_VARIANT_NAMES,
  MARKETING_HEADER_DECISION,
  selectHeroDecision,
} from './heroDecision';

describe('factory hero decision', () => {
  it('locks the hero table', () => {
    expect(HERO_DECISION_TABLE).toMatchInlineSnapshot(`
      [
        {
          "penId": "xm2iz",
          "useWhen": "claim conversion",
          "variant": "split-link-claim",
        },
        {
          "penId": "WQe2p",
          "useWhen": "informational",
          "variant": "left-content",
        },
        {
          "penId": "lnKPH",
          "useWhen": "two actions",
          "variant": "left-buttons",
        },
        {
          "penId": "OxwR1",
          "useWhen": "homepage only",
          "variant": "centered-homepage",
        },
        {
          "penId": "KhYER",
          "useWhen": "developer audience with a copy-command action",
          "variant": "npm-copy",
        },
        {
          "penId": "joK4X",
          "useWhen": "an aha capture exists",
          "variant": "f-layout-desktop-screenshot",
        },
        {
          "penId": "qENyP",
          "useWhen": "responsive projection only",
          "variant": "mobile-390",
        },
      ]
    `);
  });

  it('maps every code variant to its locked Pen contract', () => {
    expect(
      HERO_VARIANT_NAMES.map(name => [name, HERO_PEN_ID_BY_VARIANT[name]])
    ).toEqual([
      ['split-link-claim', 'xm2iz'],
      ['left-content', 'WQe2p'],
      ['left-buttons', 'lnKPH'],
      ['centered-homepage', 'OxwR1'],
      ['npm-copy', 'KhYER'],
      ['f-layout-desktop-screenshot', 'joK4X'],
      ['mobile-390', 'qENyP'],
    ]);
  });

  it.each([
    [{ useCase: 'claim-conversion', conversion: 'claim-profile' }, 'xm2iz'],
    [{ useCase: 'informational' }, 'WQe2p'],
    [{ useCase: 'two-actions', actionCount: 2 }, 'lnKPH'],
    [{ useCase: 'homepage', route: '/' }, 'OxwR1'],
    [
      {
        useCase: 'copy-command',
        audience: 'developer',
        action: 'copy-command',
      },
      'KhYER',
    ],
    [{ useCase: 'aha-capture', captureId: 'profile-claimed' }, 'joK4X'],
    [
      {
        useCase: 'responsive-projection',
        viewportWidth: 390,
        sourceVariant: 'left-content',
      },
      'qENyP',
    ],
  ] as const)('selects exactly one locked hero for %o', (input, penId) => {
    expect(selectHeroDecision(input)).toMatchObject({ penId });
  });

  it('keeps one eoUUU header across docked and scrolled states', () => {
    expect(MARKETING_HEADER_DECISION).toEqual({
      penId: 'eoUUU',
      instanceCount: 1,
      states: ['docked', 'scrolled'],
    });
  });
});
