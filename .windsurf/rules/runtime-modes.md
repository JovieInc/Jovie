---
trigger: always_on
---
## Runtime Modes (Vercel)
- Edge: latency-sensitive/public profile reads. Add `export const runtime = 'edge'`.
- Node: Stripe webhooks/checkout, Node-only libs/crypto. Add `export const runtime = 'nodejs'`.
- Never import Node-only libs in Edge code.
