# Commercial recommendations (JOV-5949)

The deterministic projection consumes a complete bounded snapshot, not a stream
of amounts to sum. Every metric references a source ID, record URL, revision,
observation timestamp and observed/hypothesis classification. Only observations
within 24 hours enter a recommendation. These are producer reports: OIDC proves
who submitted a report, not whether a payment or customer outcome is true.
Source URLs are provenance labels; this projection never fetches them.

All money is USD cents; effort is minutes. `recordedFounderMinutesPerDay` includes
sales, fulfillment, decisions and support. Candidate `additionalFounderMinutesPerDay`
is incremental effort, not a second copy of recorded work. Counts and money are
integers; margin and available cash may be negative. Missing evidence is null.

Paid rescue and control recovery remain protected. Held, no-auto, unsafe,
unconsented or unready candidates cannot win; LYB also requires its canary.
Commercial comparisons use paid value, collected cash, contribution margin,
time-to-cash and incremental founder effort without invented ROI weights.
Incomparable candidates need a bounded tradeoff decision. An existing eligible
commercial experiment remains active; this is not a queue concurrency setting.

A single eligible zero-new-spend candidate can receive an evidence-gathering
recommendation before paid proof exists. Repeated useful infrastructure jobs and
measured founder time savings can justify bounded zero-spend infrastructure work,
including when commercial evidence is incomplete. Costs and time to benefit
remain visible; hypothetical demand never becomes verified capacity or ROI.

Personal salary goals are separate from company revenue. Salary sustainability
and cost headroom remain UNKNOWN pending JOV-5926/JOV-5927 reconciliation. The
$1,200 estimate does not lift the $1,000 monthly ceiling. Reinvestment is optional.
No output grants dispatch, spending, outreach, payroll or other mutation authority.

This policy layer alone is not runtime activation. The dependent integration must
persist the snapshot/projection, deliver it through the existing Summer shadow
channel and expose authenticated readback. Session acceptance is not proof of a
model decision. Hosted CI, native landing, deployment and observed useful
selection are separate acceptance gates.
