# Playbook Authoring Guide + Template

Playbooks are the single authoring format for repeatable artist-marketing
workflows. Each playbook is compiled into a skill, evaluated against its seed
cases, and promoted mechanically — so the contract below is enforced by CI.

## File format

- One file per playbook: `docs/playbooks/<id>.playbook.md`
- The file starts with a `---` delimited **JSON** frontmatter block holding the
  machine-readable `PlaybookDefinition`, followed by a human-readable markdown
  body (rationale, caveats, links).
- Frontmatter is JSON — not YAML — because the repo carries no YAML parser
  dependency. `JSON.parse` + zod is the whole toolchain.
- The contract lives in one module:
  `apps/web/lib/playbooks/schema.ts` (`PlaybookDefinitionSchema`).

## Required fields

| Field | What it is |
| --- | --- |
| `id` | kebab-case slug, must match the filename stem |
| `title` | Human-readable name |
| `version` | semver `x.y.z` |
| `problemStatement` | The problem in the **user's** terms |
| `triggerConditions` | When this playbook should fire (≥1) |
| `requiredInputs` | Inputs the run needs (`name`, `description`, optional `example`) |
| `steps` | ≥1 steps, each `tool_call` (with `tool`) or `prompt` (with `prompt`) |
| `successMetric` | `name`, `source`, `direction`, `window` — `source` must be measurable (see below) |
| `evalSeeds` | ≥2 seed cases (`name`, `input`, `expected`) |
| `costEstimate` | `credits` and/or `usd`, optional `notes` |
| `requiredTools` | Tool ids the steps may call — every `tool_call.tool` must appear here |
| `requiredConnectors` | Connector slugs that must be linked |
| `requiredEntitlements` | Entitlement keys gating the playbook |

### Measurable success metric sources

`successMetric.source` must be one of: `smart_link_clicks`, `presave_count`,
`dsp_streams`, `merch_revenue`, `tips_revenue`, `email_captures`,
`sms_subscribers`, `profile_visits`, `custom_event` (which also requires
`eventName`). Anything else fails the `unmeasurable-success-metric` lint.

## CI validation

`pnpm --filter=@jovie/web run playbooks:validate` runs on every playbook file
change and fails with **named-rule** errors:

- `missing-frontmatter` — no `---` JSON block at the top of the file
- `invalid-frontmatter-json` — frontmatter isn't valid JSON
- `invalid-schema` — a field is missing or the wrong shape (zod)
- `missing-eval-seeds` — fewer than 2 eval seed cases
- `unmeasurable-success-metric` — metric source isn't measurable
- `undeclared-tool-deps` — a `tool_call` step uses a tool not in `requiredTools`

## Template

Copy this into `docs/playbooks/<id>.playbook.md` and fill in every field:

```markdown
---
{
  "id": "your-playbook-id",
  "title": "Your Playbook Title",
  "version": "0.1.0",
  "problemStatement": "What the artist is struggling with, in their words.",
  "triggerConditions": ["When should Jovie fire this?"],
  "requiredInputs": [
    { "name": "inputName", "description": "What it is", "example": "…" }
  ],
  "steps": [
    { "kind": "tool_call", "tool": "tool_id", "description": "What this step does" },
    { "kind": "prompt", "description": "What this step does", "prompt": "Prompt text with {{inputName}}" }
  ],
  "successMetric": {
    "name": "Metric name",
    "source": "smart_link_clicks",
    "direction": "increase",
    "window": "7d after run"
  },
  "evalSeeds": [
    { "name": "case-1", "input": {}, "expected": "…" },
    { "name": "case-2", "input": {}, "expected": "…" }
  ],
  "costEstimate": { "credits": 0, "notes": "…" },
  "requiredTools": ["tool_id"],
  "requiredConnectors": [],
  "requiredEntitlements": []
}
---

# Your Playbook Title

Why this playbook exists, caveats, and anything a human reviewer should know.
```

## Worked example

See [`release-day-announcement.playbook.md`](./release-day-announcement.playbook.md)
for a complete, valid playbook that passes the validator.
