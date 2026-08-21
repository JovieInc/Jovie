---
{
  "id": "release-day-announcement",
  "title": "Release Day Announcement",
  "version": "0.2.0",
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
      "description": "Draft fan copy. No invented metrics, scarcity, or testimonials.",
      "prompt": "Write a short release-day announcement for {{releaseId}} in a {{announcementTone}} tone. One CTA: the live smart link only if it exists. Never write open rate, click rate, list size, scarcity, or deadline numbers that were not retrieved this run. Missing ESP metrics are unverifiable — omit them. Scored claims need evidence and observed_at. No borrowed testimonials. Draft or queue-for-approval only; never auto-send or schedule without explicit human sign-off. Do not invent a send."
    },
    {
      "kind": "tool_call",
      "tool": "fan_email_send",
      "description": "Draft or queue-for-approval. Skip if fan list size is unknown or 0. Never auto-send.",
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
        "fanListSize": 200
      },
      "expected": "Smart link switches live. One live-link CTA. fan_email_send queues for human approval and does not send or schedule."
    },
    {
      "name": "release-with-empty-fan-list",
      "input": {
        "releaseId": "rel_eval_no_fans",
        "announcementTone": "understated",
        "fanListSize": 0
      },
      "expected": "Smart link switches live; fan_email_send is skipped with a clear 'no fan emails yet' message. Run still succeeds. No queue."
    }
  ],
  "costEstimate": {
    "credits": 3,
    "notes": "One LLM drafting call plus two tool calls. fan_email_send never auto-sends."
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
- `fan_email_send` drafts or queues for approval. Unknown or 0 list skips
  send; the run still succeeds. Never invent ESP metrics. One CTA. No
  borrowed testimonials. Human sign-off required to send.
- Social posting is deliberately out of scope for v0.2 — it lands as a
  separate playbook so this one stays cheap and reliable.
