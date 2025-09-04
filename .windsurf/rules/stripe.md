---
trigger: always_on
---
## Stripe
- Node-only routes: checkout, portal, webhooks with raw body.
- Store `stripe_customer_id` keyed by Clerk `userId`.
- Never import `stripe` in Edge code.
