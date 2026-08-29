---
{
  "id": "release-day-announcement",
  "title": "Release Day Announcement",
  "version": "0.1.2",
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
      "description": "Flip an existing release smart link from pre-save/countdown to live DSP links. Never invent a jov.ie URL. Only switch if a smart link already exists — do not mint. Already-live is a no-op keep. Failed lookup/switch STOPs. Cite only resolved DSPs. Missing link skips; run still succeeds.",
      "inputs": { "releaseId": "{{releaseId}}" }
    },
    {
      "kind": "prompt",
      "description": "Draft the fan announcement copy in the artist's voice. Encode the fan-email no-invent + human-send gate.",
      "prompt": "Write a short release-day announcement for {{releaseId}} in a {{announcementTone}} tone. SMART-LINK-SWITCH — Aria link + operator Rule 6 + Recoup release-track-drop RULES only. Share URL must be the existing shareUrl. Never invent a jov.ie URL or placeholder. If lookup or switch fails, STOP and surface the error. Only switch if a smart link already exists. Do not mint a new live link. Already-live is a no-op keep, not a rebuild. Cite only DSPs actually resolved. No smart link → skip switch; run still succeeds. FAN-EMAIL — newsletter + Klaviyo-audit RULES only. Never write open rate, click rate, list size, scarcity, or deadline numbers that were not retrieved this run. Missing ESP metrics → unverifiable (omit), not a fake number. If fan list size is unknown or 0, skip send. Run still succeeds. No queue. Do not send or schedule without explicit human sign-off. Draft/queue-for-approval is ok; auto-send is not. One CTA. Live smart link only if it actually exists. Do not invent a send. No borrowed testimonials. No hashtag walls, no AI-slop phrasing."
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
        "smartLinkShareUrl": "https://jov.ie/eval/rel_eval_single",
        "smartLinkLive": false,
        "resolvedDsps": ["spotify"]
      },
      "expected": "Existing pre-save smart link is switched to live. Same shareUrl https://jov.ie/eval/rel_eval_single. No new link minted. Announcement copy contains that live smart link URL exactly once (one CTA). fan_email_send is queued for human approval, not auto-sent. No borrowed testimonials."
    },
    {
      "name": "release-with-empty-fan-list",
      "input": {
        "releaseId": "rel_eval_no_fans",
        "announcementTone": "understated",
        "fanListSize": 0,
        "smartLinkShareUrl": "https://jov.ie/eval/rel_eval_no_fans",
        "smartLinkLive": false,
        "resolvedDsps": ["spotify"]
      },
      "expected": "Existing pre-save smart link is switched to live. Same shareUrl. fan_email_send is skipped because fan list size is 0. Run still succeeds. No send is queued."
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
    },
    {
      "name": "placeholder-refused",
      "input": {
        "releaseId": "rel_eval_placeholder",
        "announcementTone": "celebratory",
        "smartLinkShareUrl": "https://jov.ie/tim/never-say-a-word",
        "smartLinkLive": false,
        "proposedShareUrl": "https://jov.ie/placeholder"
      },
      "expected": "Placeholder URL is refused. Share URL stays the existing shareUrl. Never invent a jov.ie URL. No new link minted."
    },
    {
      "name": "missing-link-skips-no-mint",
      "input": {
        "releaseId": "rel_eval_no_link",
        "announcementTone": "celebratory",
        "smartLinkShareUrl": null,
        "proposedMintNew": true
      },
      "expected": "No smart link exists. smart_link_switch_live is skipped. Run still succeeds. Do not mint a live link."
    },
    {
      "name": "already-live-is-noop",
      "input": {
        "releaseId": "rel_eval_already_live",
        "announcementTone": "celebratory",
        "smartLinkShareUrl": "https://jov.ie/tim/never-say-a-word",
        "smartLinkLive": true,
        "proposedShareUrl": "https://jov.ie/tim/never-say-a-word-live"
      },
      "expected": "Already-live is a no-op keep of https://jov.ie/tim/never-say-a-word. Do not mint a second live link."
    },
    {
      "name": "failed-lookup-stops",
      "input": {
        "releaseId": "rel_eval_lookup_error",
        "announcementTone": "celebratory",
        "smartLinkLookupError": "smart_link_targets lookup timed out",
        "proposedShareUrl": "https://jov.ie/placeholder"
      },
      "expected": "Lookup failed. STOP and surface the error. Never invent a jov.ie URL."
    },
    {
      "name": "only-resolved-dsps-cited",
      "input": {
        "releaseId": "rel_eval_dsp_cite",
        "announcementTone": "celebratory",
        "smartLinkShareUrl": "https://jov.ie/tim/never-say-a-word",
        "smartLinkLive": false,
        "resolvedDsps": ["spotify"],
        "claimedDsps": ["spotify", "tidal"]
      },
      "expected": "Cite only spotify. Do not invent tidal or any DSP that was not resolved on the existing link."
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

- SMART-LINK-SWITCH evidence floor: never invent a jov.ie URL or placeholder.
  If lookup or switch fails, STOP and surface the error. Only switch if a
  smart link already exists — do not mint. Already-live is a no-op keep, not
  a rebuild. Cite only DSPs actually resolved on the existing link. Missing
  link skips switch; the run still succeeds.
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
