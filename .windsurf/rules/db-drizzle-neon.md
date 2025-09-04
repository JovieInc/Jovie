---
trigger: always_on
---
## Database (Neon + Drizzle)
- Edge-safe client: `@neondatabase/serverless` + `drizzle-orm/neon-http`.
- Migrations: Node-only with drizzle-kit; optional Node driver for non-Edge.
- Per-request: set `app.user_id` session var for policies/auditing.
- Neon hygiene: per-feature branches; cap active branches; nightly preview reset.
