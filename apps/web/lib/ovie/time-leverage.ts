import { z } from 'zod';

/**
 * time-leverage/v1: the public-safe aggregate of the Tim-time and agent-waste
 * ledgers (docs/operations/TIME_LEVERAGE.md). Category minutes, counts and
 * proposal titles only: never message text, never per-event rows.
 */
export const TIME_LEVERAGE_MAX_AGE_MS = 10 * 24 * 60 * 60 * 1000;
export const TIME_LEVERAGE_MAX_BYTES = 16 * 1024;
export const TIME_LEVERAGE_PATH = 'ovie/time-leverage/current.json';
export const TIME_LEVERAGE_API = '/api/internal/ovie/time-leverage';

const text = z.string().trim().min(1).max(200);

export const timeLeverageSchema = z.object({
  schema: z.literal('time-leverage/v1'),
  observedAt: z.iso.datetime({ offset: true }),
  windowDays: z.number().int().positive().max(90),
  tim: z.object({
    totalMinutes: z.number().finite().nonnegative(),
    humanOnlyMinutes: z.number().finite().nonnegative(),
    humanOnlyPct: z.number().finite().min(0).max(100).nullable(),
    categories: z
      .array(
        z.object({
          id: text,
          label: text,
          class: z.enum(['human_only', 'automatable', 'steering']),
          minutes: z.number().finite().nonnegative(),
        })
      )
      .max(8),
  }),
  agent: z.object({
    wastedAgentHours: z.number().finite().nonnegative().nullable(),
    ciReworkRounds: z.number().finite().nonnegative().nullable(),
    noOpWakes: z.number().finite().nonnegative().nullable(),
  }),
  proposals: z
    .array(
      z.object({
        id: text,
        title: text,
        estimate: text,
        owner: text,
        score: z.number().finite(),
      })
    )
    .max(3),
});

export type TimeLeverage = z.infer<typeof timeLeverageSchema>;

export function isTimeLeverageFresh(observedAt: string, now: number): boolean {
  const age = now - Date.parse(observedAt);
  return age >= 0 && age <= TIME_LEVERAGE_MAX_AGE_MS;
}
