# Instantly outbound commissioning

Owner: Tim White / Outbound operations. Source issue: JOV-7859. External commissioning: [JOV-8747](https://linear.app/jovie/issue/JOV-8747).

This runbook prepares campaign and reply capture configuration. It grants no
permission to send. Audience delivery is blocked in both `processOutreachBatch`
and `pushLeadToInstantly`, independent of feature flags or copy approval.
`POST /api/admin/outreach` also checks acquisition eligibility when the Instantly
feature flag is on; #20610 supplied that gate. Preserve all three boundaries.

## Receipt status

The implementation session on 2026-10-21 could not authenticate to Doppler
(`you must provide a token`); no Instantly API credential or authenticated UI
was available. Campaign templates, campaign ID and production feature flag
values remain **unverified**, and no provider or production config was changed.
The issue's earlier missing/parked config report is historical evidence only.
Do not treat this document or unit tests as a live commissioning receipt.

## Campaign template and configuration

1. In the authorized Instantly workspace, identify the Jovie claim-invite
   campaign and record its workspace and campaign IDs. Keep the campaign
   draft/paused throughout configuration. Do not activate it or enroll leads.
2. In the campaign sequence editor, set the only email step and its only
   variant to subject `{{approved_subject}}` and body `{{approved_body}}`.
   Remove default copy, signatures, appended text, automatic follow-ups and
   additional variants. Disable provider text rewriting/spintax for this
   campaign. Save, then reopen and read back the saved sequence.
3. Use a local preview with synthetic `approved_subject`, `approved_body` and
   `approved_copy_revision` values. Compare the rendered subject/body with
   those values, including line breaks. Capture the saved template and preview
   without exposing contacts, credentials or private message copy. Do not send
   a test email. The delivery adapter currently refuses all enrollment; its
   historical custom-variable mapping is not current runtime send proof.
4. With authorized production Doppler access (`jovie-web` / `prd`), set
   `INSTANTLY_CAMPAIGN_ID` to the verified campaign ID. Leave the parked
   `_INSTANTLY_API_KEY` parked and `FEATURE_INSTANTLY_OUTBOUND` unset/false.
   Do not create or activate `INSTANTLY_API_KEY` as part of commissioning.

## Reply capture

Instantly's [webhook event reference](https://developer.instantly.ai/guides/webhook-events)
defines `reply_received` separately from `auto_reply_received`. Its
[webhook setup](https://help.instantly.ai/en/articles/6261906-webhooks) supports
custom headers; there is no provider HMAC signature to verify.

1. Provision an independent random `INSTANTLY_WEBHOOK_SECRET` (at least 32
   characters) through the existing secret-management path. Never reuse the
   outbound API key or put the secret in a URL, screenshot or receipt.
2. After the route is deployed, configure an Instantly webhook for the exact
   campaign, event **Reply received** (`reply_received`), HTTPS target
   `https://jov.ie/api/webhooks/instantly`, and custom header
   `Authorization: Bearer <INSTANTLY_WEBHOOK_SECRET>`. Read back the subscription
   campaign, event, target and enabled status; redact header values.
3. Replay a provider-shaped fixture for an enrolled **synthetic staging lead**
   into staging twice with staging credentials. Confirm one `email_replied`
   row in `lead_funnel_events` and the existing Outbound Replied view. Repeat
   the delivery after a simulated persistence failure to verify retry recovery.
   Do not create a production reply milestone from a fabricated event.
4. Inspect production webhook delivery activity after a real inbound reply
   exists. Acknowledge success only when the corresponding funnel milestone
   is persisted. No outbound send is authorized to produce that reply.

The receiver requires the configured campaign and secret even when outbound is
disabled. It matches `lead_email` case-insensitively against an already-enrolled
lead (`instantly_lead_id` present); unknown contacts/campaigns and non-reply
events are acknowledged without a write. Ambiguous matches return 409 for
operator reconciliation. Missing configuration returns 503; unauthorized
requests return 401; malformed reply evidence returns 400; persistence failures
return 500 for provider retry. Monitor failed deliveries in Instantly because
repeated failures can disable the subscription.

The existing database unique key `(lead_id, event_type)` dedupes retries and
concurrent instances indefinitely. This is one reply **milestone per lead**,
not an email archive or per-message reply counter. Store only campaign, provider
lead and optional email IDs with the event timestamp; discard reply text,
HTML, subjects and recipient addresses from event metadata and responses.

## Evidence and release decision

Record the following in the linked commissioning issue after execution:

- UTC observation time, operator, repository/deployed build SHA, workspace and
  campaign IDs, and campaign draft/paused readback.
- Saved sequence/variant readback showing the exact two template expressions;
  redacted synthetic preview evidence and approved-copy revision context.
- Doppler project/config, campaign ID match, and **presence/disabled state
  only** for API-key/feature-flag/webhook-secret config. Never record values of
  secrets, contacts or private copy.
- Webhook ID, campaign/event/target/enabled readback, staging duplicate/retry
  evidence, and the first genuine production reply milestone when available.
- Manual eligibility regression result and confirmation that audience delivery
  remains blocked. Distinguish source, CI, merge, deploy and observed runtime.

Ship now: receive reply evidence behind independent webhook authentication while
sending stays closed. Re-evaluate when campaign/template/config/webhook receipts
exist and Tim explicitly decides on outbound activation. Then: handle activation
as a separate authorized change, preserving exact-revision approval and
acquisition eligibility. A flag change alone cannot reopen the current adapter.
