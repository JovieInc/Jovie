/**
 * Canonical Actions platform — stable action identity.
 *
 * These IDs are permanent. Once an ID ships it is never renamed or reused;
 * breaking changes ship as a new action version, never as an in-place edit.
 * See README.md for the evolution rules.
 */
export const ACTION_IDS = [
  'chat.start',
  'contact.create',
  'release.create',
  'task.create',
] as const;

export type ActionId = (typeof ACTION_IDS)[number];

const ACTION_ID_PATTERN = /^[a-z][a-z0-9]*\.[a-z][a-z0-9]*$/;

export function isActionId(value: string): value is ActionId {
  return (ACTION_IDS as readonly string[]).includes(value);
}

export function assertActionIdFormat(id: string): void {
  if (!ACTION_ID_PATTERN.test(id)) {
    throw new Error(
      `Invalid action id "${id}": expected "<domain>.<verb>" lowercase`
    );
  }
}
