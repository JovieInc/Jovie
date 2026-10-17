# Acquisition improvement policy

JOV-1879's source policy lives in
[`learning-policy.ts`](../apps/web/lib/acquisition/learning-policy.ts), with
strict inputs in [`learning-contract.ts`](../apps/web/lib/acquisition/learning-contract.ts).
It is a deterministic consumer of existing evidence, not a running experiment.

The event planner returns an observation, deduplicated owner route, affected-only
rebuild plan, unchanged result or budget/cancellation stop. Failure keys bind
tenant, product, failure class, capability and version. Evidence stays in private
stores; only opaque `record://` pointers cross this boundary. Nonresponse and
opt-outs cannot create failure labels or authorize retries. Rebuild plans preserve
attempts, human decisions and labels, and never reauthorize outreach.

Improvement plans freeze one variable, cohort/offer/source versions, accountable
owner, hypothesis, causal alternatives, comparison design, disjoint immutable
development/replay/held-out manifests, protected metrics, finite observation and
review windows, stop criteria, rollback and both case/experiment resource limits.
The policy checks the next operation's cost; execution owners must reserve and
charge it atomically before tools run. Unknown costs and cancellation stop work.

Commercial recommendations reuse JOV-6468's existing activation pilot evaluator.
The currently supported commercial comparison is its copy/help variant. A
different experiment, cohort, window, guardrail set, invalid join or late outcome
cannot supply its result. Actual, attributable, mature evidence must report useful
results, real payment, retained value, exact denominators, lag, source coverage,
uncertainty, failures and manual rescue cost separately from operational passes.
Zero customers never implies zero acquisition cost or demonstrated uplift.

Frozen comparison receipts, human labels and outcome calibration are required.
Unknown evidence retains the incumbent; regression rejects the challenger;
protected harm recommends rollback. Holdout reuse and self-issued scores cannot
promote. Human approval binds the entire plan/evidence digest and expires at the
review deadline. Deterministic capability repairs use comparison evidence and
ordinary shipping controls without waiting for commercial maturity or approval.
Every result has `executionAuthority: none`.

The review adapter adds the decision/blockers to the existing certification packet
for the same subject. It does not replace certification, approval or admission.
The management decision pointer, negative/inconclusive evidence and scoped
JOV-2967 learning-candidate reference remain inspectable in the result.

**Ship now:** this policy and deterministic integration tests, within the 1,500-line
source-review bound. **Re-evaluate when:**
[JOV-8497](https://linear.app/jovie/issue/JOV-8497) connects canonical event owners,
durable effects and actual Ovi projection. **Then:** commission against JOV-1875 /
JOV-5912 and the single existing JOV-6468 pilot using JOV-5243 receipts. This slice
does not install subscriptions, write issues/fixtures, reserve budgets, execute
rebuilds, contact customers or claim a real useful/paid result. Those runtime and
commissioning steps remain explicit acceptance in JOV-8497 and the existing owners.
