import { describe, expect, it } from 'vitest';
import {
  assertEveCannotAnswerAsSummer,
  assertEveCannotBroadenPermissions,
  assertEveCannotChoosePriority,
  assertEveCannotDispatchSymphony,
  assertEveCannotExecuteCode,
  assertEveCannotSelfPromote,
  EVE_FORBIDDEN_ACTIONS,
  EveAuthorityError,
  eveActionAllowed,
} from '@/lib/ovie/eve-authority';
import { routeEngineeringToLinear } from '@/lib/ovie/ingest';

describe('Eve authority (JOV-5215)', () => {
  it('denies priority, Symphony, code, self-promote, Summer answers, and permission broadening', () => {
    expect(EVE_FORBIDDEN_ACTIONS).toEqual([
      'choose-priority',
      'symphony-dispatch',
      'execute-code',
      'self-promote',
      'summer-answer',
      'broaden-permissions',
    ]);
    for (const action of EVE_FORBIDDEN_ACTIONS) {
      expect(eveActionAllowed(action)).toBe(false);
    }
    expect(() => assertEveCannotChoosePriority()).toThrow(EveAuthorityError);
    expect(() => assertEveCannotDispatchSymphony()).toThrow(EveAuthorityError);
    expect(() => assertEveCannotExecuteCode()).toThrow(EveAuthorityError);
    expect(() => assertEveCannotSelfPromote()).toThrow(EveAuthorityError);
    expect(() => assertEveCannotAnswerAsSummer()).toThrow(EveAuthorityError);
    expect(() => assertEveCannotBroadenPermissions()).toThrow(
      EveAuthorityError
    );
  });

  it('refuses Linear/Symphony dispatch from Eve ingest', () => {
    expect(() =>
      routeEngineeringToLinear({
        text: 'Jovie signup returns 500 on /start',
        lane: 'engineering',
        destination: 'kanban',
        ack: 'stored and queued for Summer lander',
        destinationHandle: null,
        workerSpawned: false,
      })
    ).toThrow(EveAuthorityError);
  });
});
