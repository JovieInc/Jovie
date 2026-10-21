# Public resolver data boundary

JOV-7831's first slice restricts the existing no-auth music resolver to core
identity and music links. The shared `resolvePublicMusic` function projects the
result **after** resolution, including enriched or cached objects. The HTTP MCP
route, official MCP clients and `jovie music resolve --json` consume that same
projection. JOV-7830's versioned REST adapter also consumes this function; its
unmerged draft is separate from this change.

Public requests accept a supplied artist, track or album input and the existing
artist/territory hints. Unknown fields such as `fields`, `expand`, `tier`, `plan`,
`sourcePermissions`, `batch` or `maxCharge` are rejected. This resource does not
accept field expansion, discovery queries or asynchronous jobs.

The public output contains resolution status, kind, title/artist, supplied or
resolved music identifiers, music links, real identity candidates, confidence,
provenance and candidate count. Optional MusicBrainz identity metadata includes
source URL, disambiguation, aliases, type, country, area/origin, ISNI/IPI and
Wikidata identifiers. `externalLinks`, `releaseGroups` and
`releaseGroupsComplete` are absent from the public schema and output. Internal
resolver metadata retains those fields for its existing uses.

Music links must match an exact domain in the canonical DSP registry, have
`showOnListenPage` enabled and carry an existing core resolver evidence kind.
Social providers and unknown destinations are withheld. Provider labels cannot
disguise another destination. Candidates accept the same catalog destinations
or MusicBrainz artist URLs. URLs containing credentials, non-HTTPS schemes or
non-default ports are withheld. Query strings and fragments are removed, except
the Apple Music numeric `i` track selector. The output rebuilds provenance,
confidence and counts from visible results; unknown joined fields are stripped.
If filtering removes every usable link and there is no exact MusicBrainz artist
identity, a resolved status becomes `no_match`. An empty ambiguity becomes
`no_match`; real permitted choices remain `ambiguous`.

All callers of this no-auth resource receive the same core boundary. A cookie,
bearer key, claimed paid tier or creator Pro/Max plan does not upgrade it. This
slice introduces no plan map, data SKU, quota allowance, price, wallet or usage
ledger. Existing durable public rate limiting, body limits and cancellation
remain in force. DSP display classification is **not** source permission for
resale, research or expanded data; JOV-7824 owns that policy.

For the future successful-result fee, a usable result must be a correctly
resolved identity with the requested, permitted deliverable actually returned.
Timeout, cancellation, unauthorized source, no match and unresolved ambiguity
cannot earn that fee. Provider retries and cache fills are operational costs,
not additional customer results. Separately priced best-effort research requires
advance disclosure and a capped authorization. No charging path is activated by
this slice, including for a successful core result.

Automatic Story Engine link creation still requires canonical exact-offer
authority in `lib/entitlements/automatic-links.ts` (JOV-7789). Public resolver
facts and cache refreshes grant no ownership, publishing, monitoring subscription
or autonomous link authority.

Verification covers enriched-object replay without mutation, unknown-field and
provenance attacks, disguised destinations, metadata removal, cancellation,
provider failure and equal core facts through raw HTTP MCP, CLI and the official
MCP SDK. Caller-asserted cookie/key cases exercise the no-auth boundary; they are
not authenticated paid-tier certification. Provider fixtures are deterministic
test data, not a live source-rights receipt or deployed runtime evidence.

Ship now: this core-only safety boundary. Re-evaluate when JOV-4875 packaging,
JOV-7824 source rights, JOV-8472 runtime/accounting and JOV-8745 client resources
are available. Then complete required continuation JOV-8746: canonical paid
grants, per-key/tenant budgets, durable reserve/commit/release and reconciled
receipts, concurrent retry/crash/batch/cancellation tests, sandbox invoice and
usage readback, exact-head CI and deployed gated-path certification. Monetization
requires an approved SKU/price and source-rights signoff. Economic certification
must include measured cold/warm mix, failures, refreshes, upstream changes,
abuse, repairs and support in cost per correctly delivered usable result and per
monitored entity-month. No margin or savings claim follows from this slice.
