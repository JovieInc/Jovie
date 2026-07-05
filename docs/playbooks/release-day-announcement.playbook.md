---
{
  "id": "release-day-announcement",
  "title": "Release Day Announcement",
  "version": "0.1.0",
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
      "description": "Draft the fan announcement copy in the artist's voice",
      "prompt": "Write a short release-day announcement for {{releaseId}} in a {{announcementTone}} tone. One clear CTA: the smart link. No hashtag walls, no AI-slop phrasing."
    },
    {
      "kind": "tool_call",
      "tool": "fan_email_send",
      "description": "Send the announcement to the artist's fan email list with the live smart link",
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
        "announcementTone": "celebratory"
      },
      "expected": "Smart link is switched to live mode, announcement copy contains the smart link URL exactly once, and one email send is queued to the fan list."
    },
    {
      "name": "release-with-empty-fan-list",
      "input": {
        "releaseId": "rel_eval_no_fans",
        "announcementTone": "understated"
      },
      "expected": "Smart link is switched to live mode; email step degrades gracefully with a clear 'no fan emails yet' message instead of failing the run."
    }
  ],
  "costEstimate": {
    "credits": 3,
    "notes": "One LLM drafting call plus two tool calls; email send cost scales with list size."
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
- Social posting is deliberately out of scope for v0.1 — it lands as a
  separate playbook so this one stays cheap and reliable.
