/**
 * Eve authority bounds (JOV-5215 / JOV-5214).
 *
 * Eve may classify and ack. It cannot choose priority, answer as Summer,
 * dispatch Symphony, execute code, promote itself, or broaden permissions.
 */

export const EVE_FORBIDDEN_ACTIONS = [
  'choose-priority',
  'symphony-dispatch',
  'execute-code',
  'self-promote',
  'summer-answer',
  'broaden-permissions',
] as const;

export type EveForbiddenAction = (typeof EVE_FORBIDDEN_ACTIONS)[number];

export class EveAuthorityError extends Error {
  constructor(readonly action: EveForbiddenAction) {
    super(`Eve denied ${action}`);
    this.name = 'EveAuthorityError';
  }
}

export function eveActionAllowed(_action: EveForbiddenAction): false {
  return false;
}

export function denyEveAction(action: EveForbiddenAction): never {
  throw new EveAuthorityError(action);
}

export function assertEveCannotChoosePriority(): never {
  denyEveAction('choose-priority');
}

export function assertEveCannotDispatchSymphony(): never {
  denyEveAction('symphony-dispatch');
}

export function assertEveCannotExecuteCode(): never {
  denyEveAction('execute-code');
}

export function assertEveCannotSelfPromote(): never {
  denyEveAction('self-promote');
}

export function assertEveCannotAnswerAsSummer(): never {
  denyEveAction('summer-answer');
}

export function assertEveCannotBroadenPermissions(): never {
  denyEveAction('broaden-permissions');
}
