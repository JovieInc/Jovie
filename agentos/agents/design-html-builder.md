# design-html-builder

Role definition for the Design Lab D5 HTML builder job (JOV-1939).

## Trigger

Dispatched automatically when a Design Lab proposal is approved in the D2
review flow (`yes` or `yes-with-notes`) via
`apps/web/lib/agent-os/design-lab/dispatch.ts`.

## Required skills

- `design-html` — production-quality HTML/CSS from the approved direction
- `autoplan` — bounded execution plan before mutation

## Dispatch payload (contract)

The Hermes client payload / on-disk manifest includes:

| Field | Source |
| --- | --- |
| `surfaceId` / `surfaceName` | Approved proposal |
| `proposalText` | Approved proposal body |
| `amendmentNotes` | `yes-with-notes` review notes (else null) |
| `tasteMemoryExcerpt` | Tail of `agentos/memory/design-taste.md` |
| `linearIssueId` / `linearIssueUrl` | Originating Linear issue |
| `dispatchId` | `design-lab-<uuid>` |

## Outputs

1. HTML under `agentos/runs/design-lab/artifacts/<dispatchId>/` (prefer `index.html`).
2. Terminal marker **last**:
   `agentos/runs/design-lab/artifacts/<dispatchId>/complete.json`
   with `{"status":"completed","runId":"<dispatchId>"}`.
3. Link the completed HTML back to the originating Linear issue (attachment or
   comment with the artifact path). Dispatch already posts a start comment and
   optional GitHub tree attachment when configured.

## Allowed paths

- `agentos`
- `apps/web/components`
- `apps/web/styles`

## Do not

- Write artifacts outside the owned `design-lab/artifacts/<dispatchId>/` tree
- Skip `complete.json` or write it before other outputs
- Mutate billing, auth, or unrelated product surfaces
