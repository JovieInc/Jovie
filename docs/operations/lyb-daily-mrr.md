# LogYourBody daily MRR source (JOV-6500)

The existing `/api/cron/daily-maintenance` schedule performs one LogYourBody MRR
measurement at 00:00 UTC daily using two RevenueCat Charts reads. Its `lybDailyMrr` receipt contains the product record
when fresh; an unavailable, stale, or unreconciled measurement makes that
sub-job fail visibly while other maintenance jobs continue. A scheduled path
in source is not evidence that a deployed invocation ran.

`GET /api/internal/ovie/lyb-mrr` is a read-only, CRON_SECRET-protected source
record for Ovie and Summer company consumers. Ovie's Mac HUD server snapshot
also includes `lybMrr` from the same reader. It calls RevenueCat's v2 MRR chart
options to discover the day resolution, then requests one UTC day in USD with
the gross revenue selector. The record is
for LogYourBody alone; it is never added to Jovie's Stripe MRR by this reader.

MRR means RevenueCat's gross monthly-normalized value of active paid
subscriptions, including annual plans at one twelfth of their annual price.
It is distinct from collected cash, proceeds after App Store fees, and free
trials. `asOfDate` is the requested UTC chart day, and `source.revision` is
RevenueCat's `last_computed_at` timestamp. A provider value of zero is
reported only when RevenueCat supplies a valid, fresh zero. Data older than
36 hours is stale and has `mrrCents: null`; missing credentials, provider
failure, malformed data, or ambiguous MRR also returns null with a state.

The read is pinned to LogYourBody RevenueCat project `proj2385165b` from
LogYourBody's 2026-06-03 provisioning record (App Store app `app5fa54db3c0`).
It requires `REVENUECAT_LYB_SECRET_API_KEY` with project-scoped read-only
`charts_metrics:charts:read` permission. Before live acceptance, verify the
project still contains only LogYourBody billing apps and the chart's daily
point layout, USD unit scale, timestamp, selector, and dashboard MRR agree. The
current parser assumes the chart's numeric MRR value is in USD major units;
that assumption needs a live same-day dashboard comparison. A source
PR, test fixture, or configured key is not a live metric receipt. The Ovie
scoreboard and Summer CLI/MCP binding owners consume this same record after
provider readback; they do not infer a zero from an unavailable response.

## Read-only provider check, 2026-09-24

The existing local RevenueCat key listed three apps in project `proj2385165b`:
LogYourBody Web (Stripe), LogYourBody App Store (`com.logyourbody.app`), and
Test Store. The USD overview endpoint returned an `mrr` metric, but its
`last_updated_at` was null, so the reader correctly marked it unreconciled
instead of treating the returned numeric value as a dated measurement. The
same key received HTTP 403 from `/charts/mrr/options`, which requires
`charts_metrics:charts:read`. The Jovie production Vercel project's environment
variable names had no RevenueCat/LYB binding at this check. None of these
reads changed credentials or permissions. Live daily execution remains
unverified until a read-only dated provider response and production binding
can be observed after deployment.
