# Weekly Paxel + Is Agentic loop

JOV-5329 uses one local weekday loop to turn coding-behavior and public
agent-readiness evidence into shipped changes. The loop is complete only when
the receipt contains a Paxel profile delta, fresh 100/100 Is Agentic reports,
and one shipped change attributed to each source.

## Compute placement

`compute-placement-v1` keeps each input where it belongs:

| Input | Placement | Retained evidence |
| --- | --- | --- |
| Paxel sessions and source | Local Docker on the coding workstation | Five axis scores, growth edge, private report URL, and score delta in a mode-0600 local receipt |
| Paxel upload | YC Paxel, after its client redacts the approved fields | Paxel-managed report; no raw transcript or source copy in this repository |
| Is Agentic | Public vendor scan of `jov.ie` and `logyourbody.com` | Score, scan time, report URL, and Essential failure IDs |
| Weekly receipt | `~/.local/state/jovie/agent-readiness/` | The bounded evidence above plus two shipped-change references |

Do not commit Paxel profile files or weekly receipts. A receipt deliberately
excludes narratives, prompt excerpts, decisions, session events, file paths,
commit metadata, and raw transcripts.

## One-time Paxel activation

Paxel needs Docker plus a YC SSO token. Complete the first sign-in from
<https://paxel.ycombinator.com> on the coding workstation. The weekly command
fails closed without `~/.paxel/token`; it never launches an unattended login.

The repository wrapper downloads the reviewed uploader to a temporary mode-0700
directory, verifies its pinned SHA-256, runs `bash -n`, and only then executes
it. It does not pipe a network response to Bash. An upstream script change is a
review event: inspect the new script before updating the pin in
`scripts/weekly-agent-readiness.mjs`.

```bash
pnpm paxel:weekly
```

The wrapper analyzes the `Jovie` project for the last week with Docker and
passes `--no-sentry`. After Paxel finishes, copy only this bounded shape from
the private profile into a file outside the repository:

```json
{
  "measured_at": "2026-10-01T16:00:00.000Z",
  "report_url": "https://paxel.ycombinator.com/reports/PRIVATE_REPORT",
  "growth_edge": "One concise growth edge from the profile",
  "scores": {
    "throughput": 7.5,
    "steering": 8,
    "eng_quality": 8.5,
    "product_thinking": 7,
    "planning": 7.5
  }
}
```

## Weekly receipt

Run on Tuesday at 09:00 America/Los_Angeles. A weekday cadence is intentional:
Paxel is a 15–30 minute local analysis and improvement loop, not a frequent LLM
poll. The receipt reads two Is Agentic reports from the public v1 API. If a
report is more than eight days old, rescan that site at
<https://is-agentic.com> and rerun the receipt command.

```bash
pnpm agent-readiness:receipt -- \
  --paxel-previous ~/.local/state/jovie/agent-readiness/paxel-previous.json \
  --paxel-current ~/.local/state/jovie/agent-readiness/paxel-current.json \
  --paxel-ship-ref https://github.com/JovieInc/Jovie/pull/NUMBER \
  --paxel-ship-summary "The shipped change caused by the Paxel growth edge" \
  --is-agentic-ship-ref https://github.com/JovieInc/Jovie/pull/NUMBER \
  --is-agentic-ship-summary "The shipped change caused by an Is Agentic finding" \
  --output ~/.local/state/jovie/agent-readiness/weekly.json
```

The command exits nonzero and writes `status: "action_required"` when either
site is below 100, an Essential finding uses either the vendor's `fail` or
`failed` result, evidence is stale, the Paxel profile is stale, or either ship
reference is missing. The operator fixes Essential issues first, ships through
the owning repository, rescans, and repeats until the same receipt is complete.

Current dispatch evidence on 2026-10-01:

- `jov.ie`: 100/100, no Essential failures.
- `logyourbody.com`: 77/100; Markdown content negotiation is failed and the
  agent-friendly Markdown 404 is partial. The required owning-repository work
  is tracked in LYB-66.
- Paxel: Docker is available on the dispatch host, but its one-time YC SSO token
  is not. The first private profile cannot be fabricated or replaced with repo
  evidence.

## Scheduling and cost

This is a Codex workspace automation on the local coding workstation, not a
GitHub Actions or Vercel cron. External volume is constant: one Paxel upload and
two public Is Agentic report reads per week, independent of user count. Both
services currently advertise the used surfaces as free; there is no production
database or application traffic.

Prior art: use the official Paxel Docker client and official Is Agentic v1 API;
the repository only wraps their missing cross-tool receipt and freshness gate.
No new scanner, scheduler, dependency, or service is introduced.

**Ship now:** local wrapper, bounded receipt, and a strict 100/100 gate.
**Re-evaluate when:** Paxel publishes a stable authenticated profile export or
Is Agentic publishes a rescan API. **Then:** replace manual bounded profile
entry or browser rescan without changing the receipt schema or privacy boundary.
