# Creator outcomes measurement contract

**Contract version:** `creator-outcomes:v1`
**Source issue:** JOV-6584

Creator outcomes are three claims. Each one can be true or unknown on its own.
None of them may be substituted for another.

| Layer | What it can establish | What it cannot establish |
| --- | --- | --- |
| Verified money | Settled merch GMV and completed tip revenue. | A click, listen, captured fan, proxy weight, or causal effect. |
| Attributed engagement | Clicks, listens, and captured fans inside an attribution window. | Revenue, or what would have happened without Jovie. |
| Causal lift | Change in verified money versus a comparable baseline window. | A blended dollarization of engagement, or a lift claim when the windows differ or the baseline is missing. |

Missing money or engagement stays `Unmeasured`. A causal claim without a
comparable verified-money baseline stays `Inconclusive`. A measured zero is a
real zero, not a hidden row.

IRPAA remains the blended North Star composite (verified GMV plus labeled
engagement proxies). It is not verified money and it is not causal lift.
`liftCents` on cohort rows remains that same blended signal difference.
`causalVerifiedMoneyLiftCents` is the only causal figure, and it uses settled
GMV and tips only.

The pure classifier is `apps/web/lib/metrics/creator-outcomes.ts`. The creator
work feed and the revenue-lift dashboard both read it. This contract adds no
collection pipeline and no schema change.
