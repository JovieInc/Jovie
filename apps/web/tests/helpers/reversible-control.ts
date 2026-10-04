/**
 * Reversible-control certification (JOV-7713, detector for JOV-7207).
 *
 * A reversible control is certified across its transition graph, not by one
 * click. The harness drives every supported input through repeated full
 * cycles, then a mixed-input cycle, then an optional remount, and records a
 * violation whenever:
 *
 *   - the control is missing, duplicated, disabled, hidden or inert;
 *   - an activation leaves the state unchanged (one-way control, or a
 *     double-bound handler that toggles twice);
 *   - the accessible state disagrees with the rendered state;
 *   - keyboard activation drops focus off the control;
 *   - a remount loses the persisted state reached by a transition.
 *
 * The driver is DOM-level, so the same contract serves RTL compositions now
 * and rendered shells later.
 */

export type ReversibleInput = 'pointer' | 'keyboard' | 'shortcut';

export interface ReversibleControlDriver<S extends string> {
  readonly states: readonly [S, S];
  readonly inputs: readonly ReversibleInput[];
  /** Logical state as rendered by the owner, e.g. `data-state`. */
  readState(): S;
  /** Every rendered instance of the control; exactly one must exist. */
  controls(): readonly HTMLElement[];
  /** Accessible attributes the control must carry in a state. */
  ariaFor?(state: S): Readonly<Record<string, string>>;
  activate(input: ReversibleInput, control: HTMLElement): Promise<void>;
  /** Unmount and render again from persisted state (hydration path). */
  remount?(): Promise<void>;
}

export interface ReversibleViolation {
  readonly step: number;
  readonly input: ReversibleInput | 'remount';
  readonly from: string;
  readonly code:
    | 'control-count'
    | 'control-unreachable'
    | 'no-transition'
    | 'aria-desync'
    | 'focus-lost'
    | 'remount-state-lost';
  readonly detail?: string;
}

/** Per-input repeated cycles plus one mixed sequence across every input. */
export function reversibleSequences(
  inputs: readonly ReversibleInput[],
  cycles = 2
): ReversibleInput[][] {
  const steps = cycles * 2;
  const single = inputs.map(input =>
    Array.from({ length: steps }, () => input)
  );
  const mixed = Array.from(
    { length: Math.max(steps, inputs.length * 2) },
    (_, index) => inputs[index % inputs.length]
  );
  return inputs.length > 1 ? [...single, mixed] : single;
}

function unreachableReason(control: HTMLElement): string | null {
  if (!control.isConnected) return 'detached';
  if (control.matches(':disabled')) return 'disabled';
  if (control.getAttribute('aria-disabled') === 'true') return 'aria-disabled';
  const blocked = control.closest('[hidden], [inert], [aria-hidden="true"]');
  return blocked ? 'hidden-or-inert' : null;
}

export async function certifyReversibleControl<S extends string>(
  driver: ReversibleControlDriver<S>,
  { cycles = 2 }: { readonly cycles?: number } = {}
): Promise<ReversibleViolation[]> {
  const violations: ReversibleViolation[] = [];
  const other = (state: S): S =>
    state === driver.states[0] ? driver.states[1] : driver.states[0];
  let step = 0;

  const single = (input: ReversibleViolation['input'], from: S) => {
    const list = driver.controls();
    if (list.length !== 1) {
      violations.push({
        step,
        input,
        from,
        code: 'control-count',
        detail: String(list.length),
      });
      return null;
    }
    return list[0];
  };

  const transition = async (input: ReversibleInput): Promise<boolean> => {
    step += 1;
    const from = driver.readState();
    const control = single(input, from);
    if (!control) return false;
    const reason = unreachableReason(control);
    if (reason) {
      violations.push({
        step,
        input,
        from,
        code: 'control-unreachable',
        detail: reason,
      });
      return false;
    }
    await driver.activate(input, control);
    const to = driver.readState();
    if (to !== other(from)) {
      violations.push({ step, input, from, code: 'no-transition', detail: to });
      return false;
    }
    const next = single(input, from);
    if (!next) return false;
    for (const [name, value] of Object.entries(driver.ariaFor?.(to) ?? {}))
      if (next.getAttribute(name) !== value)
        violations.push({
          step,
          input,
          from,
          code: 'aria-desync',
          detail: `${name}=${next.getAttribute(name)}`,
        });
    if (input === 'keyboard' && next.ownerDocument.activeElement !== next)
      violations.push({ step, input, from, code: 'focus-lost' });
    return true;
  };

  for (const sequence of reversibleSequences(driver.inputs, cycles))
    for (const input of sequence) if (!(await transition(input))) break;

  // Persist a non-initial state, remount, then prove both directions again.
  if (driver.remount && (await transition(driver.inputs[0]))) {
    const before = driver.readState();
    await driver.remount();
    step += 1;
    if (driver.readState() === before) await transition(driver.inputs[0]);
    else
      violations.push({
        step,
        input: 'remount',
        from: before,
        code: 'remount-state-lost',
      });
  }
  return violations;
}
