# Code review replay (JOV-15364)

Done-check: a reviewer receives immutable original base/head, diff and surrounding
source without the verified answer or fix. The evaluator rejects a different
input digest, keeps missing cases in the denominator, and reports unavailable
suppliers separately from completed reviews. A passing harness test is not a
completed domain benchmark or an adoption decision.

The existing capability registry remains `defined` until representative candidate
runs have certified outcomes. This runner adds no supplier integration, cron,
credential, ledger or production routing change. It uses existing evidence
producer and decision lifecycle authority.

The pinned `review-corpus-recipe.json` records the bounded historical cohort:
four verified escapes and one control checked only for screenshot registration.
Its trusted manifest digest is
`3453dad76ececfd5b6604d94710e8be4c22cae4892e80de78e5b688da6415e45`.
Reconstruct source from its original SHA references and this source contract;
a materialization with different bytes yields a different cohort. The full
snapshots and candidate run receipts are experiment artifacts, separate from
this harness change. The recipe includes answers and must never be given to
a blinded reviewer.

## Materialize once

Use historical GitHub reads at full immutable SHAs, never current source. Include
unchanged consumers that explain the defect (for example an explicit testMatch
configuration). Supply a JSON source object:

```json
{
  "schema": "jovie.code-review-corpus-source/v1",
  "cases": [{
    "id": "escape-19417",
    "source": {
      "repository": "JovieInc/Jovie",
      "originalPr": 19417,
      "baseSha": "<40 hex original base>",
      "headSha": "<40 hex original head>"
    },
    "diff": "<original PR diff>",
    "context": [{
      "path": "apps/web/playwright.config.screenshots.ts",
      "revisionSha": "<original head or base SHA>",
      "content": "<full surrounding file at that revision>"
    }],
    "answer": {
      "scope": "listed-defects-only",
      "defects": [{
        "id": "missing-registration",
        "path": "apps/web/playwright.config.screenshots.ts",
        "startLine": 1,
        "endLine": 20,
        "rationale": "<verified defect mechanism and actual line range>",
        "evidenceUrl": "https://github.com/JovieInc/Jovie/pull/19467"
      }],
      "verification": {
        "fixSha": "<40 hex verified fix head>",
        "evidenceUrl": "https://github.com/JovieInc/Jovie/pull/19467",
        "rationale": "<why this fix confirms this defect>"
      }
    }
  }]
}
```

```sh
node scripts/capability-benchmark/review-benchmark.mjs materialize source.json new-corpus-dir
```

The destination must not exist. Outputs are `manifest.json`, `answers.json` and
`inputs/<id>.json`. The manifest binds every input and answer with SHA-256 over
canonical JSON. Loading rechecks all digests. Commit a reviewed manifest and its
snapshots to pin a corpus; hashes detect changes relative to that trusted manifest,
not malicious replacement of the entire manifest. Hand only `inputs/` to a
reviewer. Keep answers, fix PRs, adjudication and source material outside their
workspace. The runner is an offline integrity/scoring tool, not an isolation sandbox.

For a fixed control, materialize the fix revision and its corresponding base/diff
as a separate case, with an empty defects array only after independently checking
the relevant defect. Its scope stays `listed-defects-only`; never declare a whole
fix PR clean. Historical replay labels alone do not qualify as verified answers.
Correct a label when historical source disproves it before adding that case.

## Record and adjudicate

A run has schema `jovie.code-review-run/v1`, `corpusDigest`, `candidate` and `cases`.
Candidate fields are `requested`, `verified`, `evidence`, and `kind` (`reviewer`,
`no-model`, or `route-only`). Record actual provider/model/version identity evidence;
a requested name is not verification. Unavailable candidates can leave `verified`
null and must explain availability per case. Never infer provider identity from a
brand name or an agent's unsupported self-description.

Each case records `caseId`, `inputDigest` and `status`. `unavailable` or `skipped`
requires `reason` and cannot include findings/cost. `completed` requires canonical
millisecond UTC `startedAt`/`endedAt`, `costUsd` (nonnegative number or null), and
`findings` (an array, even when empty). Findings have `id`, `path`, `startLine`,
`endLine`, `summary`. Preserve raw findings, including duplicates and mistakes.
A route-only result also requires boolean `routed` and no findings. Run that
baseline against the existing deterministic route classifier; its routing recall
is distinct from defect recall. A no-model baseline reports no findings, so its
confirmed recall on positives is zero.

Adjudications are a separate run array with `caseId`, `findingId`, `verdict`,
`defectId`, `rationale`, `evidenceUrl`. Verdicts: `confirmed`, `duplicate`,
`false-positive`, `harmful`, `out-of-scope`. Confirmation requires a verified
defect id and overlapping original source location (primary location or an
optional predeclared nonempty `allowedLocations` array of path/startLine/endLine
ranges). Adding accepted locations changes the answer digest and corpus version;
never silently expand the frozen oracle after seeing candidate output.
Independent adjudication must still verify the same mechanism; a correct guess elsewhere
cannot count. Adjudicate the mechanism as well as the location. Unknown findings
stay pending; they never increase precision. Findings outside the bounded known
defect scope need further investigation and are not automatically false positives.
Multiple confirmations of one defect count once and expose duplicate noise.

```sh
node scripts/capability-benchmark/review-benchmark.mjs baseline corpus-dir route-only route-run.json
node scripts/capability-benchmark/review-benchmark.mjs baseline corpus-dir no-model no-model-run.json
node scripts/capability-benchmark/review-benchmark.mjs evaluate corpus-dir run.json report.json
node --test scripts/capability-benchmark/capability-benchmark.test.mjs
```

The report separates planned/completed/missing/skipped/unavailable counts,
coverage, confirmed defect recall, conservative precision lower bound (unique confirmed /
all findings; pending and out-of-scope claims are unconfirmed, not automatically false), duplicates, false positives, harmful and pending findings,
p50/p95/n latency and known costs. Total cost is null unless every planned case
has measured cost; zero means measured zero. Coverage and planned defect recall
cannot improve by omitting a hard case. A completed empty review of a positive
is a miss. Unavailable results never count as clean controls.

Ship now: retain the existing review path while collecting this bounded evidence.
Re-evaluate when: the same pinned cohort has sufficiently covered, independently
adjudicated internal and challenger reviews with verified identity and measured
cost. Then: compare defect detection, harmful/false-positive burden, latency,
availability and cost, and record a bounded sourcing decision in the existing
registry. The Nov 4 JOV-10691 result (15-file PR #24363, 4m35s, one of five Sentry
findings detected) is historical evidence, not a fresh execution of this corpus.
