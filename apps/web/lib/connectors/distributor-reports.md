# Explicit distributor report adapters

`distributor-report-import.ts` accepts account-holder-authorized CSV, TSV, or
structured JSON with an explicit owner mapping. JSON has `columns: string[]`
and `rows: string[][]`; numeric cells must remain exact decimal strings.
There is no vendor layout detection, OAuth flow, API access, or PDF/OCR parser.
The approved provider list comes from `DISTRIBUTOR_MANIFESTS`; RouteNote uses
the same mapping path as AWAL, UnitedMasters, and the other approved providers.
The manifests retain their unverified-layout and unavailable-capability status.

The server supplies the authenticated financial owner's ID. Validate a new
mapping with `registerOwnerColumnMapping(owner, candidate, savedVersions)` and
insert the returned record under an immutable `(ownerUserId, id, version)` key.
Retries of the same version are accepted; mutations require the next version.
Reuse a saved mapping through `readOwnerColumnMapping` and
`importMappedDistributorReport`. Headers, their order, provider, account,
declared source version, and monetary basis must match. A source version must
be identified or explicitly declared unversioned. Mapping versions and source
versions are separate; the receipt retains both and a digest of the mapping.

Each import verifies the actual source bytes against the SHA-256 digest and its
per-file approval receipt. Keep the original artifact in owner-only storage and
pass its durable reference in `originalEvidenceRef`. Supply source references
for the currency and gross/net earnings basis. Unknown basis, missing currency,
and conflicting statement/row currencies fail. No currency conversion occurs.
Inputs are bounded to 8 MiB, 50,000 data records, and 128 columns. Data locators
are one-based logical records excluding the header, rather than physical lines;
quoted multiline CSV cells therefore keep stable record identities.

For UnitedMasters, follow the [official statement workflow](https://support.unitedmasters.com/hc/en-us/articles/11982416053907-What-earnings-stats-and-statements-can-I-see):
in Wallet → Reports select the month, generate its statement if necessary, and
download the monthly PDF. Retain that original, then call
`enterDistributorStatementSummary` with the manually transcribed total, explicit
currency, and page/section references. `entryMode: manual_summary`,
`manualValues`, and the manual-entry processor ID distinguish transcription
from parsing. Summaries have no lines, ISRCs, or catalog attribution. Enter one
total per currency, rather than adding a breakdown to its grand total.

Persist the complete `DistributorReportReceipt`, including evidence and mapping
metadata, rather than its normalized statement alone. At preview supply the
complete active owner/account receipt set as `existingReports`. At commit,
rerun `assertNoDistributorReportOverlap` within the durable account commit/CAS
boundary. Any intersecting summary coverage, even with a different statement
ID or currency, requires reconciliation. Activity periods take priority;
reporting periods are the fallback. Incomparable periods fail closed. Duplicate
digests and statement IDs also require reconciliation. This helper does not
provide concurrency control or authorize financial storage access.

The shared durable repository (JOV-8431), authenticated preview/commit
(JOV-8432), catalog resolution (JOV-8433), reconciliation (JOV-8438), and
Settings Connections UI (JOV-8441) own those boundaries. These adapters do not
publish a user-facing import capability ahead of their receipts.

Ship now: explicit mappings and manually labeled evidence only. Re-evaluate
when an exact vendor layout has authorized fixtures and a successful read
receipt. Then enable only the evidenced layout, preserving this explicit path.
