---
{
  "id": "jovie-release-planner",
  "title": "Jovie Release Planner",
  "version": "0.1.0",
  "problemStatement": "I need a week-by-week plan for my next release, or my catalog is sitting there with no upcoming drop and I do not know what to do this month.",
  "triggerConditions": [
    "Artist asks to plan a release, rollout, or drop",
    "Catalog has no upcoming release and the artist wants a plan anyway",
    "Artist asks what to do with a live catalog single that is already on DSPs"
  ],
  "requiredInputs": [
    {
      "name": "artistUsername",
      "description": "Jovie artist username",
      "example": "tim"
    },
    {
      "name": "nextTitle",
      "description": "Upcoming release title if one exists. Empty means catalog-reactivation mode.",
      "example": ""
    },
    {
      "name": "targetDate",
      "description": "Upcoming release date ISO-8601 if one exists. Empty means catalog-reactivation mode.",
      "example": ""
    }
  ],
  "steps": [
    {
      "kind": "prompt",
      "description": "Load catalog, llms.txt, and public profile. Choose upcoming-drop or catalog-reactivation. Never invent a next single.",
      "prompt": "Today is the run date. Artist @{{artistUsername}}. Optional nextTitle={{nextTitle}} targetDate={{targetDate}}. Load jovie profile, releases, events, merch, https://jov.ie/{{artistUsername}}/llms.txt, and the public profile page. If nextTitle and targetDate are both non-empty, mode=upcoming-drop. Otherwise mode=catalog-reactivation using the latest live smart link. Do not invent a title. Write a 60-second diagnosis plus a week-by-week plan. Keep a live smart link. Skip fan email if list size is unknown or zero. Do not editorial-pitch a release older than 8 weeks as new. Do not auto-fill bio. Asset specs: 3000x3000 cover RGB no URLs, 1280x720 thumb, 1080x1920 stories, 1500x500 X header with focal content in the upper-right two-thirds."
    },
    {
      "kind": "prompt",
      "description": "If merch count is 0, instruct generate_merch drafts from the latest cover with identity preserve. Never publish.",
      "prompt": "From the plan for @{{artistUsername}}, if merch is empty, call generate_merch as drafts only from the latest release artwork. Identity-preserve. Do not publish. If merch already exists, skip."
    }
  ],
  "successMetric": {
    "name": "Latest smart link clicks",
    "source": "smart_link_clicks",
    "direction": "increase",
    "window": "14d after run"
  },
  "evalSeeds": [
    {
      "name": "catalog-reactivation-tim-2026-08-13",
      "input": {
        "artistUsername": "tim",
        "nextTitle": "",
        "targetDate": "",
        "today": "2026-08-13",
        "releases": [
          {
            "title": "Never Say A Word",
            "type": "single",
            "releaseDate": "2024-06-21",
            "smartLink": "https://jov.ie/tim/never-say-a-word",
            "smartLinkLive": true
          }
        ],
        "releaseCount": 18,
        "merchCount": 0,
        "eventCount": 0,
        "apiBio": null,
        "fanListSize": null
      },
      "expected": "mode=catalog-reactivation. Uses Never Say A Word live smart link https://jov.ie/tim/never-say-a-word. Does not invent a next single. Does not rebuild the smart link. Does not editorial-pitch Never Say A Word as a new release. generate_merch drafts only, not published. fan_email_send skipped because fanListSize is unknown. Bio not auto-filled."
    },
    {
      "name": "upcoming-drop-six-weeks-out",
      "input": {
        "artistUsername": "tim",
        "nextTitle": "Example Next Single",
        "targetDate": "2026-09-25",
        "today": "2026-08-13"
      },
      "expected": "mode=upcoming-drop. Plan covers T-8 to T+3d with playlist pitch 2-4 weeks pre-release, T-0 smart_link_switch_live, fan email 8-10am with one CTA. Does not treat Never Say A Word as the drop being planned."
    },
    {
      "name": "empty-fan-list-skips-email",
      "input": {
        "artistUsername": "tim",
        "nextTitle": "",
        "targetDate": "",
        "fanListSize": 0
      },
      "expected": "fan_email_send is skipped with a clear reason. Run still succeeds. No send is queued."
    }
  ],
  "costEstimate": {
    "credits": 4,
    "notes": "Two LLM planning calls. Optional generate_merch drafts are billed separately and never auto-published."
  },
  "requiredTools": [],
  "requiredConnectors": [],
  "requiredEntitlements": []
}
---

# Jovie Release Planner

Orchestrator for a 4–8 week release, or catalog reactivation when there is no upcoming drop.

v0 was dogfooded 2026-08-13 on https://jov.ie/tim (18 historical singles, latest Never Say A Word 2024-06-21, live smart link, empty merch, empty API bio). Catalog-reactivation is eval seed 1.

Caveats:

- This playbook sequences. Pitch, retouch, merch, smart-link switch, and fan email execute elsewhere.
- `generate_merch` is draft-only. Publish is out of scope.
- A live DSP smart link is a no-op keep, not a rebuild.
- Bio is taste. Do not auto-fill.
- Featured empty-state rail is out of scope (JOV-4790).
