# Jovie AI Pricing Strategy

## Pricing Model: AI as the Upgrade Lever

Jovie uses a **tiered subscription model** where AI capabilities are the primary driver
for upgrades. Free users get a taste of Jovie AI to experience value, while paid plans
unlock the full toolset that makes AI actionable.

## Tier Summary

| Feature | Free | Pro ($39/mo) | Growth ($99/mo) |
|---|---|---|---|
| **AI Chat Messages** | 5/day | 100/day | 500/day |
| **AI Tools** (Canvas, Promo, Releases) | No | Yes | Yes |
| **Profile Verification Badge** | No | Yes | Yes |
| **Analytics Retention** | 7 days | 90 days | 365 days |
| **Contacts** | 100 | Unlimited | Unlimited |
| **Export Contacts** | No | Yes | Yes |
| **Remove Branding** | No | Yes | Yes |
| **Advanced Analytics** | No | Yes | Yes |

## AI Feature Gating Details

### Free Tier (5 messages/day, chat-only)

Free users can ask Jovie AI general questions about their career, get advice based on
their profile data, and see the value of having an AI music career assistant. They
**cannot** use any tools:

- No profile editing via AI
- No Spotify Canvas planning
- No promotion strategy generation
- No release creation
- No related artist suggestions

When a free user asks for something that requires a tool, Jovie AI explains the feature
is available on Pro and describes the value.

**Why 5/day:** This is enough for 1-2 short conversations to experience the product.
At ~$0.01-0.05 per Claude API call, worst-case cost per free user is $0.25/day or
~$7.50/month -- acceptable for conversion-driving usage. Most free users will use 0-2
messages/day.

### Pro Tier (100 messages/day, full tools)

Pro users get the full Jovie AI experience:
- All AI tools unlocked (canvas planning, promo strategy, profile editing, etc.)
- 100 messages/day covers even power users (median expected usage: 10-20 messages/day)
- Profile verification badge

### Growth Tier (500 messages/day, full tools)

Growth users get higher limits for heavier workflows:
- 500 messages/day for batch operations and extensive planning
- All Pro features
- Future: priority model access, bulk canvas generation

## Rate Limiting Architecture

Two layers of rate limiting protect against cost overruns:

1. **Daily plan quota** (plan-specific): 5/100/500 messages per day per user
2. **Hourly burst limiter** (all plans): 30 messages per hour per user

The burst limiter prevents a Pro user from burning through all 100 messages in minutes
of rapid-fire usage, which would spike API costs. The daily quota is the user-facing
limit tied to plan value.

Both use the existing Redis-backed rate limiter with in-memory fallback.

## Verification as a Paid Feature

The `isVerified` badge on artist profiles is gated to Pro and Growth plans via
`PLAN_LIMITS.canBeVerified`. This follows the model proven by X (Twitter Blue),
Meta Verified, and YouTube:

- Verification is **visible** to every profile visitor (fans, bookers, curators)
- It signals legitimacy and professionalism
- It's a low-cost, high-perceived-value feature that drives upgrades

The `creatorProfiles.isVerified` column already exists in the database schema.
Plan gating should be enforced at the API layer when setting verification status.

## Cost Model

| Plan | Max Daily AI Cost/User | Monthly Worst Case | Expected Monthly |
|---|---|---|---|
| Free | $0.25 | $7.50 | $1-3 |
| Pro | $5.00 | $150 | $10-30 |
| Growth | $25.00 | $750 | $30-80 |

Pro at $39/mo with expected $10-30/mo AI cost = ~25-75% gross margin on AI.
This is in line with the 50-65% gross margin benchmarks for AI-first SaaS (a16z).

## When to Revisit

After 6 months of usage data:

1. **Check free-tier conversion rate.** If <2%, consider reducing to 3 messages/day.
   If >10%, the free tier may be too generous -- test tightening.
2. **Check Pro margin.** If top-10% Pro users regularly hit 100 messages with high
   tool usage, consider a credits-based overage or moving heavy tools to Growth.
3. **Consider outcome-based pricing.** Once canvas video generation is automated
   end-to-end, price per canvas created ($2-5 each) rather than per message.
4. **Evaluate credits model.** If usage patterns vary widely within a tier, credits
   may better align cost to value. But avoid this complexity until data proves it's needed.

## Implementation Files

- `apps/web/lib/stripe/config.ts` -- PLAN_LIMITS with AI quotas and verification
- `apps/web/lib/rate-limit/config.ts` -- Plan-specific daily rate limiters
- `apps/web/lib/rate-limit/limiters.ts` -- `checkAiChatRateLimitForPlan()`
- `apps/web/app/api/chat/route.ts` -- Plan-aware rate limiting and tool gating
