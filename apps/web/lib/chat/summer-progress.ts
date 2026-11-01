/**
 * Truthful Summer progress for the chat thread. Every line comes from an event
 * the fast endpoint actually sent (data-summer-progress); nothing is inferred,
 * timed locally or invented. Unknown or malformed parts are dropped.
 */
export type SummerProgressPart =
  | { readonly kind: 'meta'; readonly model: string }
  | {
      readonly kind: 'tool';
      readonly name: string;
      readonly phase: 'start' | 'done' | 'error';
      readonly ms: number | null;
    }
  | {
      readonly kind: 'status';
      readonly text: string | null;
      readonly phase: string;
    }
  | { readonly kind: 'plan'; readonly summary: string };

export interface SummerProgressLine {
  readonly key: string;
  readonly text: string;
  readonly state: 'running' | 'done' | 'failed';
}

const TOOL_LABELS: Readonly<Record<string, string>> = {
  shipping_state: 'shipping',
  spend: 'spend',
  sentry: 'errors',
  signals: 'signals',
  governor: 'priorities',
  revenue: 'revenue',
  linear: 'issues',
  gbrain: 'notes',
};

export const SUMMER_PROGRESS_MAX_PARTS = 24;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;
const str = (value: unknown) => (typeof value === 'string' ? value : null);

export function parseSummerProgress(value: unknown): SummerProgressPart | null {
  if (!isRecord(value)) return null;
  switch (value.kind) {
    case 'meta': {
      const model = str(value.model);
      return model ? { kind: 'meta', model } : null;
    }
    case 'tool': {
      const name = str(value.name);
      const phase = value.phase;
      if (!name) return null;
      if (phase !== 'start' && phase !== 'done' && phase !== 'error')
        return null;
      return {
        kind: 'tool',
        name,
        phase,
        ms:
          typeof value.ms === 'number' && Number.isFinite(value.ms)
            ? value.ms
            : null,
      };
    }
    case 'status': {
      const phase = str(value.phase);
      return phase ? { kind: 'status', phase, text: str(value.text) } : null;
    }
    case 'plan': {
      const summary = str(value.summary);
      return summary !== null ? { kind: 'plan', summary } : null;
    }
    default:
      return null;
  }
}

const labelFor = (name: string) =>
  TOOL_LABELS[name] ?? name.replaceAll('_', ' ');

/**
 * Collapses start/done/error pairs per tool and returns calm lines, newest
 * last. A tool is "running" only until the endpoint reports its done or error.
 */
export function summerProgressLines(
  parts: readonly SummerProgressPart[]
): SummerProgressLine[] {
  const lines: SummerProgressLine[] = [];
  for (const part of parts) {
    if (part.kind === 'tool') {
      const label = labelFor(part.name);
      const index = lines.findIndex(
        line => line.key === `tool:${part.name}` && line.state === 'running'
      );
      const line: SummerProgressLine =
        part.phase === 'start'
          ? {
              key: `tool:${part.name}`,
              text: `Checking ${label}…`,
              state: 'running',
            }
          : part.phase === 'done'
            ? {
                key: `tool:${part.name}`,
                text: `Checked ${label}${part.ms === null ? '' : ` · ${part.ms} ms`}`,
                state: 'done',
              }
            : {
                key: `tool:${part.name}`,
                text: `Couldn’t check ${label}`,
                state: 'failed',
              };
      if (index >= 0) lines[index] = line;
      else lines.push(line);
    } else if (part.kind === 'status' && part.text) {
      lines.push({
        key: `status:${part.phase}`,
        text: part.text,
        state: 'running',
      });
    } else if (part.kind === 'plan') {
      lines.push({ key: 'plan', text: 'Plan ready', state: 'done' });
    }
  }
  return lines.slice(-3);
}
