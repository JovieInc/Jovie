# Paid canary allowance

The standard factory does not enable the paid Gateway route from credentials
alone. An operator must supply a reviewed JSON allowance with `--paid-budget`.
Creating a file is not permission to spend; execute only after the user approves
the named canary and its cost. Claude/Codex subscription calls keep their existing
routing and allowance. They are outside the incremental Gateway estimate below.

```json
{ "id": "homepage-canary-2026-10-02", "maxEstimatedUsd": 6.1034496 }
```

The implementation accepts a smaller estimate ceiling, never a larger one.
Do not execute this example as part of deterministic verification.

| Z.AI model through Vercel Gateway | Maximum submissions | Output cap | Reservation per submission |
| --- | ---: | ---: | ---: |
| `zai/glm-5.3` | 4 | 4,096 tokens | $1.4860288 |
| `zai/glm-5.3-flash` | 1 | 4,096 tokens | $0.1593344 |
| Total | 5 | | $6.1034496 |

`max_tokens` caps generation, including reasoning. The request pins provider
`zai` with `providerOptions.gateway.only`; there are no application retries or
model fallbacks. Each factory stage gets one cumulative attempt in this canary.
A rejected, failed, truncated, timed-out, or interrupted request never refunds
its reservation. A truncated or provider-error response fails the stage.

The rates were verified on 2026-10-02: GLM-5.3 is $1.40 input / $4.40 output per
million tokens; Flash is $0.15 / $0.50. The estimate reserves 1,048,576 input tokens
plus the output cap for every submission. Providers document a “1M” context;
the binary interpretation provides a conservative margin. The 32,768-byte prompt
limit is only a payload admission limit, not an input-token count or tokenizer.
Unknown models or invalid/expired pricing block dispatch. The checked-in snapshot
expires at 2026-10-03 00:00 UTC and needs source verification before renewal.

Reservations live in `runs/factory/.paid-budgets/`, outside the page directory
that fresh factory runs replace. An exclusive lock, fsync and atomic rename
persist each reservation before dispatch. A page-and-brief binding prevents a
new ID from renewing the same canary. Missing, corrupt or mismatched state fails
closed. Never delete ledgers, locks or binding markers to obtain more attempts.
The run manifest records the budget ID, policy digest and ledger path.

This is a local **estimated-spend ceiling**, not a guaranteed provider invoice
cap. Provider/Gateway internal retries, billing for failed requests and later
rate changes are outside local control. Subscription CLI output-token caps are
not supplied by their current interfaces. Judge independence and quality gates
are unchanged; any failed gate still stops the canary.

Sources: [Z.AI pricing](https://docs.z.ai/guides/overview/pricing),
[Z.AI request limits](https://docs.z.ai/api-reference/llm/chat-completion),
[GLM-5.3 Gateway model](https://vercel.com/ai-gateway/models/glm-5.3),
[Flash Gateway model](https://vercel.com/ai-gateway/models/glm-5.3-flash),
[provider routing](https://vercel.com/docs/ai-gateway/models-and-providers/provider-options).

Ship now: fail closed around one explicitly approved canary.
Re-evaluate when: the pricing snapshot expires or the canary needs another attempt.
Then: verify current provider terms and obtain a new scoped allowance; do not reset
the existing ledger or weaken the required panel.
