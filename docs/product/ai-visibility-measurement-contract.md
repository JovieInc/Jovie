# AI visibility measurement contract

**Contract version:** `aeo-measurement-layers:v1`

This source contract keeps three customer-facing measurement layers distinct:

| Layer | What it can establish | What it cannot establish by itself |
| --- | --- | --- |
| Readiness | A page is prepared for retrieval, or an AI service fetched it. | An answer mention, citation, referral, purchase, revenue, or causal lift. |
| Observed Visibility | A versioned answer-engine sample contains a mention or citation. | A referral, purchase, revenue, or causal lift. |
| Business Outcomes | An attributable referral, claim, fan action, inquiry, purchase, or revenue event. | Causal lift without a comparable baseline and attributable evidence. |

AI crawler request counts are **Readiness Signals**. A crawler read proves a
service fetched a page; it does not prove that the page was mentioned in an
answer or that a commercial outcome followed. Citation monitoring remains an
**Observed Visibility** measurement because it records the result of a
versioned prompt and response sample. Business outcome metrics require their
own attributable event evidence.

This slice exposes the versioned disclosure helper
`getAeoMeasurementDisclosure` in `apps/web/lib/aeo/citation-monitor.ts` and
uses it on the crawler card and detail panel. It makes the current evidence
boundary visible to customers. A trusted cross-layer claim validator is
**UNIMPLEMENTED** in this slice because the existing AEO/profile and outcome
surfaces do not provide one shared, independently authored provenance record.
Until that boundary exists, missing or stale telemetry remains `Unknown` and
no readiness or visibility value may be presented as a referral, revenue
result, or causal lift.

## Existing evidence sources

- `apps/web/lib/canaries/artist-profile-proof.ts` records profile-readiness
  checks and observed before/after changes. It does not infer causality.
- `apps/web/lib/aeo/asset-visibility.ts` and
  `apps/web/lib/aeo/citation-monitor.ts` hold versioned asset and citation
  observations for the Observed Visibility layer.
- `apps/web/lib/services/ai-crawler-analytics/` reads Cloudflare crawler
  activity. That activity is machine access evidence and remains a Readiness
  Signal.
- Existing referral, purchase, and revenue surfaces remain the source of
  Business Outcomes evidence; they are not inferred from crawler or citation
  counts.

## Acceptance contract

1. Each metric is assigned to exactly one layer and uses the canonical
   disclosure for that layer.
2. Customer-facing crawler surfaces say **AI Crawler Reads** and disclose that
   reads do not establish referral or revenue attribution.
3. Citation and prompt samples remain Observed Visibility measurements.
4. The trusted cross-layer claim validator is **UNIMPLEMENTED** pending an
   independently authored observation and outcome provenance contract.
5. Missing, stale, or absent telemetry stays `Unknown`; unsupported causal
   claims stay `Inconclusive`.
6. Causal-lift claims require attributable evidence and a comparable baseline
   once that trusted outcome boundary exists.
7. The certification adapter and resolver-to-certification integration remain
   separate work. This contract adds no collection service or analytics
   pipeline.
