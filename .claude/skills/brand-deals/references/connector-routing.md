# Connector routing

## Poll before prompting

For every required source:

1. Inspect the available connectors.
2. Query the connector's authenticated profile.
3. Compare the returned identity with the required identity
   case-insensitively.
4. Use a matching connector only for read-only evidence discovery.
5. If no connector matches, prompt the user with the exact missing account and
   provider.

Do not assume that an installed, active, or previously used connector is
authenticated as the right person.

## Tim's personal Gmail

The required personal mailbox is `t@timwhite.co`. The Jovie company mailbox
`tim@jov.ie` is not a substitute.

Preferred routing:

1. Use a Codex Gmail connector only if its profile is `t@timwhite.co`.
2. Otherwise, inspect Composio:

   ```bash
   composio connections list
   composio proxy \
     https://gmail.googleapis.com/gmail/v1/users/me/profile \
     --toolkit gmail
   ```

3. Require `emailAddress` to equal `t@timwhite.co` case-insensitively.
4. Search with `GMAIL_FETCH_EMAILS` using metadata-only, small-result queries.
5. Hydrate only shortlisted evidence with
   `GMAIL_FETCH_MESSAGE_BY_THREAD_ID`.

If the `composio` command is an older incompatible client, locate the current
binary reported by the official installer before concluding that the connector
is unavailable. Never print or persist a Composio API key.

Composio's CLI is an agent research and bootstrap surface, not Jovie's
production runtime contract. A verified agent may use it to source evidence,
but Inbox writes still go through Jovie's tested
`emitBrandDealOpportunity` server boundary.

## Minimum-safe Gmail behavior

- Read only.
- Query metadata before bodies.
- Keep source IDs rather than raw bodies.
- Never send, draft, label, archive, or delete without a separate explicit
  user-approved action.
- Do not treat a newsletter, affiliate blast, gifting offer, or generic
  campaign invite as a qualified buyer.
- Do not infer budget. An opportunity cannot pass the $7,500-$12,500 gate
  without a current brief, email, or approved recommendation supporting it.

## Social connectors

Poll each native social connector independently. An authenticated YouTube
connection does not prove Instagram or TikTok ownership, and a matching public
handle does not prove any authenticated account. If a social connector is
expired, report that exact lane as blocked and ask the user to reconnect it.
