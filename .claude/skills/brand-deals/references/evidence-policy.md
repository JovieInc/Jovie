# Evidence policy

## Source authority

| Claim | Acceptable proof | Discovery only |
| --- | --- | --- |
| Creator owns an account or asset | Authenticated native dashboard, native export, first-party account settings | Search result, matching display name, repost, channel title |
| Audience or content metric | Native analytics with account identity and observed date | Public follower count, third-party estimate |
| Personal past brand deal | Personal email thread, signed contract, invoice, payment receipt, authenticated Backstage booking | A7X3 client, creator-economy relationship, public campaign |
| Buyer is warm and current | Direct personal correspondence plus current role or verified introduction | Old contact, adjacent founder, former employer |
| Budget and terms | Current brief, email, offer, SOW, contract | Typical market rate |
| Deposit collected | Payment processor, bank, or invoice receipt | Verbal acceptance, signed SOW |

Public metrics may support discovery. They do not prove unique reach, ownership, audience quality, or conversion.

Do not infer ownership from a search result, matching display name, repost, channel title, or adjacent relationship.

## Required provenance record

Record these fields for every evidence item:

- `sourceType`
- `sourceAccount`
- `authenticationBroker`
- `sourceReference`
- `observedAt`
- `identityMatched`
- `ownershipVerified`
- `personalDealVerified`
- `confidence`

If any required field is missing, label the item unverified and exclude it from buyer-facing materials.

## Tim-specific separations

- Treat `t@timwhite.co` as the required personal Gmail identity for personal deal history.
- Never substitute `tim@jov.ie`.
- If Codex Gmail is occupied, poll Composio Gmail and verify the
  `users/me/profile` address before prompting the user to replace a connector.
- Treat A7X3 as company-side influencer activation unless a separate personal Tim engagement is proven.
- Treat Backstage.com as relevant personal UGC, acting, and influencer history.
- Reject Backstage.Army as an unrelated source.
- Do not upgrade creator-economy adjacency into a verified buyer relationship.

## Correction rule

When Tim or another source disproves a claim:

1. Withdraw every buyer-facing artifact containing it.
2. Remove the claim from generators and templates.
3. Search for sibling claims produced by the same inference.
4. Add a deterministic regression case.
5. Rebuild only after first-party proof exists.
