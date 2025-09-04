---
trigger: always_on
---
## Postgres RLS Pattern
- Use `current_setting('app.user_id', true)` in select/insert/update policies.
- Never hardcode user IDs; always set the session var server-side.
