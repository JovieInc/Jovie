/**
 * Ship by risk and confidence (Tim, 2026-11-09): "based on confidence and
 * risk, you decide how long to wait for my answer. And most things should
 * just be shipping." High confidence and low risk ships now; low confidence
 * and low risk waits up to 48 hours, then ships; risky changes wait longer;
 * outbound to customers and spend never ship on silence.
 *
 * Pure: the Summer card contract derives a card's deadline and default from
 * this when the filer declares risk and confidence instead of a deadline.
 * The windows below are the starting values; Tim tunes them.
 */

export const SHIP_POLICY_SCHEMA = 'jovie.ship-policy/v1' as const;

export const SHIP_RISKS = ['low', 'medium', 'high'] as const;
export type ShipRisk = (typeof SHIP_RISKS)[number];

export const SHIP_CONFIDENCES = ['high', 'low'] as const;
export type ShipConfidence = (typeof SHIP_CONFIDENCES)[number];

export type ShipGate =
  /** Ships now; the card is a receipt Tim can still reverse. */
  | 'ship_now'
  /** Waits for Tim, then ships on silence. */
  | 'wait_then_ship'
  /** Waits for Tim and never ships on silence; the card settles as not shipped. */
  | 'wait_for_tim'
  /** Outbound or spend: only Tim's yes acts; silence rejects. */
  | 'tim_only';

export interface ShipPolicyInput {
  readonly kind: 'outbound' | 'spend' | 'taste' | 'decision';
  readonly risk: ShipRisk;
  readonly confidence: ShipConfidence;
}

export interface ShipPolicyDecision {
  readonly schema: typeof SHIP_POLICY_SCHEMA;
  readonly gate: ShipGate;
  readonly waitHours: number;
  readonly defaultDecision: 'approve' | 'reject';
  /** Card copy for what happens if Tim doesn't answer. */
  readonly defaultIfSilent: string;
}

/**
 * Hours to wait before shipping on silence; `null` never ships on silence. A
 * card still never waits forever ("nothing waits on a human"): risky, unsure
 * work settles as not shipped after a week.
 */
const WAIT_HOURS: Readonly<
  Record<ShipRisk, Readonly<Record<ShipConfidence, number | null>>>
> = {
  low: { high: 0, low: 48 },
  medium: { high: 24, low: 72 },
  high: { high: 72, low: null },
};

/** Outbound and spend keep the existing silence-rejects window. */
const TIM_ONLY_WAIT_HOURS = 48;
/** Risky, unsure work gets Tim's longest window, then settles unshipped. */
const WAIT_FOR_TIM_HOURS = 7 * 24;

export function shipPolicy(input: ShipPolicyInput): ShipPolicyDecision {
  if (input.kind === 'outbound' || input.kind === 'spend')
    return {
      schema: SHIP_POLICY_SCHEMA,
      gate: 'tim_only',
      waitHours: TIM_ONLY_WAIT_HOURS,
      defaultDecision: 'reject',
      defaultIfSilent:
        input.kind === 'outbound'
          ? 'Nothing is sent without your yes.'
          : 'Nothing is spent without your yes.',
    };
  const wait = WAIT_HOURS[input.risk][input.confidence];
  if (wait === null)
    return {
      schema: SHIP_POLICY_SCHEMA,
      gate: 'wait_for_tim',
      waitHours: WAIT_FOR_TIM_HOURS,
      defaultDecision: 'reject',
      defaultIfSilent: "Doesn't ship unless you approve it within 7 days.",
    };
  if (wait === 0)
    return {
      schema: SHIP_POLICY_SCHEMA,
      gate: 'ship_now',
      waitHours: 0,
      defaultDecision: 'approve',
      defaultIfSilent: 'Ships now. Reject to roll it back.',
    };
  return {
    schema: SHIP_POLICY_SCHEMA,
    gate: 'wait_then_ship',
    waitHours: wait,
    defaultDecision: 'approve',
    defaultIfSilent: `Ships in ${wait} hours unless you reject it.`,
  };
}
