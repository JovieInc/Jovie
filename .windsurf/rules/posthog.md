---
trigger: always_on
---
## PostHog (Analytics + Flags)
- Use `@/lib/analytics` wrapper only (never import PostHog SDKs directly elsewhere).
- Client: init provider; respect DNT. Server: secure capture and SSR flag checks when HTML must reflect split.
- Use Clerk `userId` as `distinct_id` when signed in; anonymous otherwise.
