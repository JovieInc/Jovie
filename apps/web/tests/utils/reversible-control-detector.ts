// Invariant consumer: JOV-INV-041.
export type ReversibleActivation = 'keyboard' | 'pointer';

export interface ReversibleControlObservation<State extends string> {
  readonly state: State;
}

export interface ReversibleControlTransition<State extends string> {
  readonly from: State;
  readonly index: number;
  readonly to: State;
  readonly via: ReversibleActivation;
}

export interface ReversibleControlDetector<State extends string> {
  readonly name: string;
  readonly states: readonly [State, State];
  readonly observe: () =>
    | Promise<ReversibleControlObservation<State>>
    | ReversibleControlObservation<State>;
  readonly activate: (
    via: ReversibleActivation,
    transition: ReversibleControlTransition<State>
  ) => Promise<void> | void;
  readonly assertContinuity?: (
    observation: ReversibleControlObservation<State>,
    transition: ReversibleControlTransition<State> | null
  ) => Promise<void> | void;
  /**
   * Six transitions certify pointer-only, keyboard-only, and mixed cycles.
   * A surface with a direction-specific affordance may provide another even
   * sequence, but it must retain at least two complete cycles.
   */
  readonly activationSequence?: readonly ReversibleActivation[];
}

const DEFAULT_ACTIVATION_SEQUENCE = Object.freeze([
  'pointer',
  'pointer',
  'keyboard',
  'keyboard',
  'pointer',
  'keyboard',
] satisfies readonly ReversibleActivation[]);

export async function detectReversibleControl<State extends string>({
  name,
  states,
  observe,
  activate,
  assertContinuity,
  activationSequence = DEFAULT_ACTIVATION_SEQUENCE,
}: ReversibleControlDetector<State>): Promise<
  readonly ReversibleControlTransition<State>[]
> {
  if (
    states[0] === states[1] ||
    activationSequence.length < 4 ||
    activationSequence.length % 2 !== 0
  ) {
    throw new Error(
      `${name}: a reversible detector requires two distinct states and at least two complete cycles`
    );
  }
  for (const required of ['pointer', 'keyboard'] as const) {
    if (!activationSequence.includes(required)) {
      throw new Error(`${name}: activation sequence must include ${required}`);
    }
  }

  const initial = await observe();
  if (initial.state !== states[0]) {
    throw new Error(
      `${name}: expected initial state ${states[0]}, observed ${initial.state}`
    );
  }
  await assertContinuity?.(initial, null);

  const transitions: ReversibleControlTransition<State>[] = [];
  let current = states[0];
  for (const [index, via] of activationSequence.entries()) {
    const next = current === states[0] ? states[1] : states[0];
    const transition = { from: current, index, to: next, via } as const;
    await activate(via, transition);
    const observation = await observe();
    if (observation.state !== next) {
      throw new Error(
        `${name}: ${via} transition ${index + 1} expected ${current} -> ${next}, observed ${observation.state}`
      );
    }
    await assertContinuity?.(observation, transition);
    transitions.push(transition);
    current = next;
  }

  return transitions;
}
