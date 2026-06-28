# SMS Unit Economics Spike (JOV-3626)

> **Status:** Spike complete — 2026-06-28 | **Provider:** Twilio | **Gate:** `OUTBOUND_SMS_ENABLED=true`

## Fully-loaded cost per segment (US baseline)

| Component | USD | Notes |
|-----------|-----|-------|
| Twilio carrier (outbound) | ~$0.0079 | 10DLC; varies by carrier |
| Jovie compute + delivery log | ~$0.0001 | Cron/webhook POST + one DB row |
| **Per GSM-7 segment** | **~$0.008** | Release bodies cap near 2 segments (~$0.016/alert) |

## Margin floor (Growth $99/mo)

At 1,000 two-segment alerts/mo → ~$16 provider COGS (~16% of ARPU). **Re-evaluate when:**

1. **>5,000 segments/day** fleet-wide → negotiate Twilio volume tier.
2. **Any artist >500 SMS subs** with >2 alerts/mo → SMS add-on or per-send metering.
3. **Segment cost >$0.012** → adjust Growth pricing or overage.

## Ship / re-evaluate

| Decision | Ship now | Re-evaluate when | Then |
|----------|----------|------------------|------|
| Twilio sole provider | Yes | Telnyx beats by >20% at 10k/mo | Second adapter file |
| `OUTBOUND_SMS_ENABLED` off by default | Yes | A2P 10DLC verified | Flip `prd` Doppler |
| Webhook auto-replies via connector | Yes | >2% error rate 24h | Pause flag |

Consent/opt-out: `notification_contacts.smsStatus`, per-artist subscriptions, Twilio `21610` → `suppressPhoneForStop`. Inbound STOP/HELP process regardless of `OUTBOUND_SMS_ENABLED` (TCPA).

**Code:** `providers/sms/outbound-sms.ts`, `twilio-sender.ts`, `send-release-notifications/route.ts`, `webhooks/sms/route.ts`