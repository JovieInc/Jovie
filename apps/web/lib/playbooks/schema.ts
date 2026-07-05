/**
 * PlaybookDefinition authoring contract (GH #13184 / JOV-3943).
 *
 * Single source of truth for the playbook authoring format. Playbooks are
 * markdown files (`docs/playbooks/*.playbook.md`) with a JSON frontmatter
 * block delimited by `---` markers. The frontmatter is JSON (not YAML)
 * because the repo intentionally carries no YAML parser dependency.
 *
 * Everything a consumer needs is exported from this one module:
 *   - `PlaybookDefinitionSchema` (zod) + `PlaybookDefinition` type
 *   - `parsePlaybookFrontmatter` (markdown -> raw frontmatter + body)
 *   - `validatePlaybookSource` (schema check + lint, named-rule errors)
 *
 * The CI validator (`apps/web/scripts/validate-playbooks.ts`) and the unit
 * tests both consume this module. See `docs/playbooks/TEMPLATE.md` for the
 * authoring guide and worked example.
 */

import { z } from 'zod';

/** Minimum number of eval seed cases a playbook must ship with. */
export const MIN_EVAL_SEEDS = 2;

/**
 * Metric sources the platform can actually measure. A success metric bound
 * to anything else is unmeasurable and fails lint. `custom_event` requires
 * an `eventName` so it stays mechanically checkable.
 */
export const MEASURABLE_METRIC_SOURCES = [
  'smart_link_clicks',
  'presave_count',
  'dsp_streams',
  'merch_revenue',
  'tips_revenue',
  'email_captures',
  'sms_subscribers',
  'profile_visits',
  'custom_event',
] as const;

export type MeasurableMetricSource = (typeof MEASURABLE_METRIC_SOURCES)[number];

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SEMVER_PATTERN = /^\d+\.\d+\.\d+$/;

const PlaybookToolCallStepSchema = z.object({
  kind: z.literal('tool_call'),
  /** Tool id invoked by this step. Must appear in `requiredTools`. */
  tool: z.string().min(1),
  description: z.string().min(1),
  /** Static or templated inputs passed to the tool. */
  inputs: z.record(z.string(), z.string()).optional(),
});

const PlaybookPromptStepSchema = z.object({
  kind: z.literal('prompt'),
  description: z.string().min(1),
  /** Prompt text (may reference required inputs as {{placeholders}}). */
  prompt: z.string().min(1),
});

export const PlaybookStepSchema = z.discriminatedUnion('kind', [
  PlaybookToolCallStepSchema,
  PlaybookPromptStepSchema,
]);

export const PlaybookSuccessMetricSchema = z.object({
  /** Human-readable metric name, e.g. "Smart link CTR". */
  name: z.string().min(1),
  /** Where the measurement comes from. Linted against MEASURABLE_METRIC_SOURCES. */
  source: z.string().min(1),
  /** Custom analytics event name — required when source is `custom_event`. */
  eventName: z.string().min(1).optional(),
  direction: z.enum(['increase', 'decrease']),
  /** Measurement window, e.g. "7d after run". */
  window: z.string().min(1),
});

export const PlaybookEvalSeedSchema = z.object({
  name: z.string().min(1),
  /** Concrete input fixture the eval harness feeds the playbook. */
  input: z.record(z.string(), z.unknown()),
  /** What a passing run looks like, in checkable terms. */
  expected: z.string().min(1),
});

export const PlaybookCostEstimateSchema = z
  .object({
    credits: z.number().nonnegative().optional(),
    usd: z.number().nonnegative().optional(),
    notes: z.string().optional(),
  })
  .refine(value => value.credits !== undefined || value.usd !== undefined, {
    message: 'costEstimate must declare `credits` or `usd` (or both)',
  });

export const PlaybookDefinitionSchema = z.object({
  /** Unique slug — doubles as the filename stem (`<id>.playbook.md`). */
  id: z.string().regex(SLUG_PATTERN, 'id must be a kebab-case slug'),
  title: z.string().min(1),
  version: z.string().regex(SEMVER_PATTERN, 'version must be semver x.y.z'),
  /** Problem statement in the user's terms, not ours. */
  problemStatement: z.string().min(1),
  /** Conditions under which this playbook should fire. */
  triggerConditions: z.array(z.string().min(1)).min(1),
  requiredInputs: z.array(
    z.object({
      name: z.string().min(1),
      description: z.string().min(1),
      example: z.string().optional(),
    })
  ),
  steps: z.array(PlaybookStepSchema).min(1),
  successMetric: PlaybookSuccessMetricSchema,
  /** Eval seed cases. Lint enforces MIN_EVAL_SEEDS. */
  evalSeeds: z.array(PlaybookEvalSeedSchema),
  costEstimate: PlaybookCostEstimateSchema,
  /** Tool ids this playbook is allowed to call. */
  requiredTools: z.array(z.string().min(1)),
  /** Connector slugs that must be linked before the playbook can run. */
  requiredConnectors: z.array(z.string().min(1)),
  /** Entitlement keys gating the playbook. */
  requiredEntitlements: z.array(z.string().min(1)),
});

export type PlaybookDefinition = z.infer<typeof PlaybookDefinitionSchema>;
export type PlaybookStep = z.infer<typeof PlaybookStepSchema>;

/** Named lint/validation rules surfaced in CI errors. */
export type PlaybookValidationRule =
  | 'missing-frontmatter'
  | 'invalid-frontmatter-json'
  | 'invalid-schema'
  | 'missing-eval-seeds'
  | 'unmeasurable-success-metric'
  | 'undeclared-tool-deps';

export interface PlaybookValidationError {
  rule: PlaybookValidationRule;
  message: string;
  /** JSON path into the frontmatter, when applicable. */
  path?: string;
}

export type PlaybookValidationResult =
  | { ok: true; definition: PlaybookDefinition; body: string }
  | { ok: false; errors: PlaybookValidationError[] };

const FRONTMATTER_PATTERN = /^--- *\n([\s\S]*?)\n--- *(?:\n|$)/;

export interface PlaybookFrontmatterResult {
  /** Raw frontmatter text between the `---` markers (JSON). */
  frontmatter: string | null;
  /** Markdown body after the frontmatter block. */
  body: string;
}

/**
 * Split a `.playbook.md` source into its JSON frontmatter and markdown body.
 */
export function parsePlaybookFrontmatter(
  raw: string
): PlaybookFrontmatterResult {
  const match = FRONTMATTER_PATTERN.exec(raw);
  if (!match) {
    return { frontmatter: null, body: raw };
  }
  return { frontmatter: match[1], body: raw.slice(match[0].length) };
}

function lintPlaybook(
  definition: PlaybookDefinition
): PlaybookValidationError[] {
  const errors: PlaybookValidationError[] = [];

  if (definition.evalSeeds.length < MIN_EVAL_SEEDS) {
    errors.push({
      rule: 'missing-eval-seeds',
      path: 'evalSeeds',
      message: `playbook must declare at least ${MIN_EVAL_SEEDS} eval seed cases (found ${definition.evalSeeds.length})`,
    });
  }

  const { source, eventName } = definition.successMetric;
  const isMeasurableSource = (
    MEASURABLE_METRIC_SOURCES as readonly string[]
  ).includes(source);
  if (!isMeasurableSource) {
    errors.push({
      rule: 'unmeasurable-success-metric',
      path: 'successMetric.source',
      message: `successMetric.source "${source}" is not a measurable source. Use one of: ${MEASURABLE_METRIC_SOURCES.join(', ')}`,
    });
  } else if (source === 'custom_event' && !eventName) {
    errors.push({
      rule: 'unmeasurable-success-metric',
      path: 'successMetric.eventName',
      message:
        'successMetric.source "custom_event" requires `eventName` so the metric is mechanically bindable',
    });
  }

  const declaredTools = new Set(definition.requiredTools);
  definition.steps.forEach((step, index) => {
    if (step.kind === 'tool_call' && !declaredTools.has(step.tool)) {
      errors.push({
        rule: 'undeclared-tool-deps',
        path: `steps[${index}].tool`,
        message: `step ${index + 1} calls tool "${step.tool}" which is not declared in requiredTools`,
      });
    }
  });

  return errors;
}

/**
 * Validate a raw `.playbook.md` source: frontmatter presence, JSON parse,
 * zod schema, then lint rules. Returns named-rule errors on failure.
 */
export function validatePlaybookSource(raw: string): PlaybookValidationResult {
  const { frontmatter, body } = parsePlaybookFrontmatter(raw);

  if (frontmatter === null) {
    return {
      ok: false,
      errors: [
        {
          rule: 'missing-frontmatter',
          message:
            'playbook file must start with a `---` delimited JSON frontmatter block',
        },
      ],
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(frontmatter);
  } catch (error) {
    return {
      ok: false,
      errors: [
        {
          rule: 'invalid-frontmatter-json',
          message: `frontmatter is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }

  const result = PlaybookDefinitionSchema.safeParse(parsed);
  if (!result.success) {
    return {
      ok: false,
      errors: result.error.issues.map(issue => ({
        rule: 'invalid-schema' as const,
        path: issue.path.map(String).join('.') || undefined,
        message: issue.message,
      })),
    };
  }

  const lintErrors = lintPlaybook(result.data);
  if (lintErrors.length > 0) {
    return { ok: false, errors: lintErrors };
  }

  return { ok: true, definition: result.data, body };
}
