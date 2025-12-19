# Database Usage Best Practices

## Why this matters
Neon + Drizzle can do fast, safe transactions—but only when we use the
transaction-capable client and keep session variables scoped correctly.
Follow these patterns to keep RLS secure and pooling efficient.

## Use the pooled, transaction-capable client
- **Default**: import from `@/lib/db` (see `lib/db/index.ts`).
- This uses `@neondatabase/serverless` **Pool** + `drizzle-orm/neon-serverless`
  with WebSocket support enabled.
- Avoid creating new pools in hot paths. Reuse the singleton `db` client.

### Node-only WebSocket config
Transactions require WebSockets. In Node, configure:

```ts
import { neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

neonConfig.webSocketConstructor = ws;
```

`lib/db/index.ts` already does this for app code. For scripts, use
`scripts/utils/neon-client.ts`.

## Always set session variables for RLS
RLS policies read `current_setting('app.user_id', true)` or
`current_setting('app.clerk_user_id', true)`. Set both for compatibility.

### Preferred helpers
Use the helpers in `lib/auth/session.ts`:
- `withDbSession(...)` for non-transactional operations.
- `withDbSessionTx(...)` for transactional work (recommended when RLS matters).

These ensure `SET LOCAL` is applied inside the transaction scope so the
session variables are visible to policies.

## Transaction guidance
- Use `db.transaction(...)` (or `withDbSessionTx`) for any write path that
  depends on RLS or requires atomic multi-step work.
- Keep transactions short and focused—no network calls inside.

## Scripts & one-off tools
For scripts that touch Neon, use `scripts/utils/neon-client.ts`:
- It initializes the Pool with WebSocket support.
- Always `await pool.end()` in a `finally` block.

## Quick checklist
- ✅ Use `drizzle-orm/neon-serverless` everywhere.
- ✅ Reuse pooled `db` from `@/lib/db`.
- ✅ Set session vars (`app.user_id` + `app.clerk_user_id`) inside the
  transaction when RLS is involved.
- ✅ Keep transactions short and scoped.
