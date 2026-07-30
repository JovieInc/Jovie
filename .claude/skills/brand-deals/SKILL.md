---
name: brand-deals
description: Run one high-integrity creator brand partnership from evidence through deposit, fulfillment, and reporting. Use for sponsor evidence, personal deal-history mining, Backstage opportunities, buyer qualification, opportunity scoring, Inbox approve or reject decisions, SOWs, rights negotiation, campaign preparation, tracking, invoicing, and repeat-demand analysis.
---

# Brand Deals

Operate one creator-side campaign at a time. Optimize:

`(expected upfront cash × close probability × repeat potential) ÷ creator minutes`

Read [evidence-policy.md](references/evidence-policy.md) before researching a creator or buyer. Read [commercial-guardrails.md](references/commercial-guardrails.md) before recommending terms, drafting a SOW, or approving external communication.
For Tim White, also read
[connector-routing.md](references/connector-routing.md) and
[tim-brand-deal-canon.md](references/tim-brand-deal-canon.md) before sourcing
opportunities or building sponsor materials.

## 1. Verify source identity before reading evidence

1. List the sources needed for the task.
2. Poll each connector's authenticated profile before searching it.
3. Compare the authenticated identity with the required account.
4. If the Codex Gmail connector is occupied by another account, check Composio
   before asking the user to replace it. Verify Composio Gmail with the Gmail
   `users/me/profile` endpoint and compare the returned address
   case-insensitively.
5. If every available connector is absent or authenticated as the wrong
   account, stop that source lane and ask the user to connect the correct
   account. Continue only with independent verified sources.
6. Label every fact with its source, account, authentication broker, observed
   date, and confidence.

Never merge these lanes:

- `t@timwhite.co`: Tim's personal brand-deal email.
- `tim@jov.ie`: Jovie company email, not a substitute for personal deal history.
- A7X3: Tim's former influencer-activation company. Its clients and relationships are not automatically Tim's personal brand deals.
- Backstage.com: Tim's personal acting, UGC, and influencer opportunity channel.
- Backstage.Army: unrelated to Backstage.com.
- Creator-economy relationships: adjacency only until a personal deal, warm introduction, or current buying authority is proven.

Do not infer ownership from a channel name, search result, repost, video title, or matching display name. A native account export, authenticated dashboard, contract, invoice, or first-party email must prove ownership.

For personal email research, query metadata first and hydrate only shortlisted
threads. Do not copy raw email bodies into Jovie. Store the minimum provenance
needed to revisit the source: authenticated account, broker, thread or message
ID, sender, subject, observation time, and the exact commercial facts used.
Never send, label, archive, or delete mail during evidence mining.

## 2. Establish the campaign gate

Before surfacing a buyer, verify:

- No sponsor campaign is currently active.
- The opportunity has verified creator identity and provenance.
- The buyer relationship is a personal deal, personal inbound, authenticated marketplace match, or verified warm introduction.
- The budget can support a $7,500-$12,500 campaign and at least a 50% deposit.
- The proposed rights avoid perpetual usage, unlimited revisions, and broad exclusivity.
- The sponsor owns the primary CTA. Jovie tracking measures the campaign without diluting it.
- LYB is not the CTA until its paid flow has passed purchase and restore verification.

Run:

```bash
node .claude/skills/brand-deals/scripts/validate-opportunity.mjs <opportunity.json>
```

Do not surface an opportunity in Inbox unless validation returns `valid: true`.

For Jovie runtime insertion, use
`emitBrandDealOpportunity` from
`apps/web/lib/connectors/brand-deal-opportunity-emitter.ts`. Never insert a
brand-deal `suggested_actions` row directly. The emitter verifies the connected
account identity, refuses a second pending buyer decision, and stores the
canonical decision-only kind. If it reports a missing or mismatched connector,
prompt the user to connect the required account and do not downgrade the
evidence standard.

## 3. Research and rank candidates

Use current research only after its runtime preflight passes. `/last30days` results are discovery evidence, never proof of the creator's ownership or past deal. Prefer:

1. Verified personal past buyers and agency contacts.
2. Authenticated inbound email and Backstage opportunities.
3. Verified warm introductions to current budget owners.
4. Marketplace matches with clear budget and deliverables.
5. Cold qualified buyers only when the warm set is exhausted.

Do not mass email. Prepare no more than five personalized recommendations per day.

For each candidate, record:

- Buyer and current role.
- Provenance and source account.
- Authentication broker and verified profile identity.
- Verified personal relationship type.
- Budget and expected deposit.
- Creator and audience fit.
- Rights risk.
- Close probability.
- Repeat potential.
- Estimated creator minutes.
- Ranking score.
- Missing connector or evidence.

## 4. Use two explicit approval gates

Create one `brand_deal.opportunity` Inbox item at a time.

### Gate A: buyer approval

Show Tim the buyer, provenance, economics, fit, rights summary, ranking score, and recommendation.

- Reject: record the reason and advance to the next qualified candidate.
- Approve: prepare the concept, recommendation, scripts, fixed SOW, tracking plan, invoice, and draft communication. Do not send or commit commercially yet.

### Gate B: commercial commitment

Show the exact price, deliverables, deposit, timeline, usage, revisions, exclusivity, cancellation terms, and external message.

- Reject: revise within the fixed scope or move on.
- Approve: send only the approved message and fixed SOW, then request the 50% deposit.

Never treat buyer approval as permission to change price, rights, deliverables, or recipients.

## 5. Activate only after cash

Mark the campaign active only when the deposit is captured. Keep every other sponsor opportunity pending or declined while one campaign is active.

Prepare all work before Tim records:

- One recommended concept.
- One script and shot list.
- One recording session.
- One approval round.
- One included revision.
- Sponsor-first CTA and transparent tracking.
- Publication checklist.
- Report and invoice schedule.

Tim records once, approves once, and publishes. Agents handle preparation, edits, tracking, reporting, and invoicing.

## 6. Close the loop

Capture:

- Cash collected and collection date.
- Tim minutes.
- Revision count.
- Published assets and rights window.
- Sponsor CTA performance.
- Jovie tracking coverage.
- Report delivery.
- Repeat request, renewal, referral, or rejection reason.

Use observed campaign outcomes to update the next ranking. Never present Jovie, LYB, native monetization, or repeat demand as guaranteed revenue.

## Output contract

Always report:

- Current campaign slot: open or occupied.
- Evidence status and connector identity.
- One recommended next decision.
- Exact user approval required.
- What Jovie will prepare automatically after approval.
- Any blocked source lane.

Never claim a deal, metric, relationship, send, submission, deposit, or campaign result without direct evidence.
