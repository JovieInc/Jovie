---
{
  "id": "release-day-announcement",
  "title": "Release Day Announcement",
  "version": "0.1.1",
  "problemStatement": "My song just went live and I don't have time to update my link, tell my fans, and post everywhere before the day is over.",
  "triggerConditions": [
    "A tracked release reaches its release date and is live on at least one DSP",
    "The artist has not already run a release-day announcement for this release"
  ],
  "requiredInputs": [
    {
      "name": "releaseId",
      "description": "The release entity going live today",
      "example": "rel_01hxyz"
    },
    {
      "name": "announcementTone",
      "description": "Voice for fan-facing copy (defaults to the artist's saved voice profile)",
      "example": "celebratory, no hype-slop"
    }
  ],
  "steps": [
    {
      "kind": "tool_call",
      "tool": "smart_link_switch_live",
      "description": "Flip the release smart link from pre-save/countdown mode to live DSP links",
      "inputs": { "releaseId": "{{releaseId}}" }
    },
    {
      "kind": "prompt",
      "description": "Draft the fan announcement copy in the artist's voice. Encode the fan-email no-invent + human-send gate.",
      "prompt": "Write a short release-day announcement for {{releaseId}} in a {{announcementTone}} tone. FAN-EMAIL — newsletter + Klaviyo-audit RULES only. Never write open rate, click rate, list size, scarcity, or deadline numbers that were not retrieved this run. Missing ESP metrics → unverifiable (omit), not a fake number. If fan list size is unknown or 0, skip send. Run still succeeds. No queue. Do not send or schedule without explicit human sign-off. Draft/queue-for-approval is ok; auto-send is not. One CTA. Live smart link only if it actually exists. Do not invent a send. No borrowed testimonials. No hashtag walls, no AI-slop phrasing."
    },
    {
      "kind": "tool_call",
      "tool": "fan_email_send",
      "description": "Queue the announcement for human approval with the live smart link. Skip if fan list size is unknown or 0. Never auto-send.",
      "inputs": { "releaseId": "{{releaseId}}" }
    }
  ],
  "successMetric": {
    "name": "Release-day smart link clicks",
    "source": "smart_link_clicks",
    "direction": "increase",
    "window": "48h after run"
  },
  "evalSeeds": [
    {
      "name": "single-release-with-email-list",
      "input": {
        "releaseId": "rel_eval_single",
        "announcementTone": "celebratory",
        "fanListSize": 80,
        "humanSignOff": false,
        "liveSmartLink": "https://jov.ie/eval/rel_eval_single"
      },
      "expected": "Smart link is switched to live mode. Announcement copy contains the live smart link URL exactly once (one CTA). fan_email_send is queued for human approval, not auto-sent. No borrowed testimonials."
    },
    {
      "name": "release-with-empty-fan-list",
      "input": {
        "releaseId": "rel_eval_no_fans",
        "announcementTone": "understated",
        "fanListSize": 0
      },
      "expected": "Smart link is switched to live mode. fan_email_send is skipped because fan list size is 0. Run still succeeds. No send is queued."
    },
    {
      "name": "invented-list-size-refused",
      "input": {
        "releaseId": "rel_eval_unknown_list",
        "announcementTone": "celebratory",
        "fanListSize": null,
        "proposedListSize": 12400
      },
      "expected": "Invented list-size 12400 is refused. Missing list size is unknown. fan_email_send is skipped. Run still succeeds. No queue."
    },
    {
      "name": "missing-open-rate-unverifiable",
      "input": {
        "releaseId": "rel_eval_no_esp",
        "announcementTone": "celebratory",
        "fanListSize": 80,
        "openRate": null,
        "proposedOpenRate": 0.42
      },
      "expected": "Missing open rate is unverifiable and omitted. Copy does not invent 42% or any open/click/scarcity/deadline number that was not retrieved this run."
    },
    {
      "name": "no-human-signoff-no-send",
      "input": {
        "releaseId": "rel_eval_needs_approval",
        "announcementTone": "celebratory",
        "fanListSize": 80,
        "humanSignOff": false
      },
      "expected": "fan_email_send does not send or schedule. Draft/queue-for-approval only. Auto-send is not allowed without explicit human sign-off."
    }
  ],
  "costEstimate": {
    "credits": 3,
    "notes": "One LLM drafting call plus two tool calls; email send cost scales with list size and still requires human sign-off."
  },
  "requiredTools": ["smart_link_switch_live", "fan_email_send"],
  "requiredConnectors": [],
  "requiredEntitlements": ["automation_credits"]
}
---

# Release Day Announcement

The highest-frequency "day one" workflow: when a release goes live, the smart
link must flip from pre-save to live DSP links and fans should hear about it
the same day. This playbook does exactly that — nothing else.

Notes for reviewers:

- The smart link flip is idempotent; re-running on an already-live link is a
  no-op by design.
- Fan email copy goes through the artist's saved voice profile; the
  `announcementTone` input only nudges it.
- `fan_email_send` is draft/queue-for-approval only. Auto-send is not allowed
  without explicit human sign-off. If fan list size is unknown or 0, skip
  send — the run still succeeds and nothing is queued.
- Never write open rate, click rate, list size, scarcity, or deadline numbers
  that were not retrieved this run. Missing ESP metrics are unverifiable
  (omit). One CTA. Live smart link only if it actually exists. No borrowed
  testimonials.
- Social posting is deliberately out of scope for v0.1 — it lands as a
  separate playbook so this one stays cheap and reliable.
