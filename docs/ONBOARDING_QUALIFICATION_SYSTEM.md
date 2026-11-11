# Onboarding qualification system

Status: spec, slice 1 shipped (#24499), slice 2 in design
Date: 2026-11-08
Goal (Tim, 2026-11-07): "driving homepage to first paid signup as would buy on a
real customer test".
Extends: [customer certification](design-system/CERTIFICATION_V2_CUSTOMERS.md),
the revenue cone (`apps/web/lib/acquisition/eligibility.ts`) and the
`buyer_would_pay` waitlist hold (PR #24468). This document does not fork them.

## The path this system serves

Request access → qualified → certified for this person → let in → claim their
profile → checkout → paid → first value.

Every step records a funnel step with the person's cohort (role, score band,
question variant), so the system can see where each cohort drops.

## Today (repo at 80de8b22)

- Signup is closed (`PUBLIC_SIGNUP_CLOSED`). `/signup` and cold `/claim/start`
  land on `/waitlist`. Since 2026-11-09 (`ONE_FLOW_ONBOARDING`, Tim: "there is
  no separate waitlist versus onboarding. It's one flow") anonymous `/start`
  runs the chat, always under controlled golden-path admission, and the claim
  admits or holds.
- The `/waitlist` role form stores a role and an email
  (`lib/waitlist/role-entry.ts`). It gets no score. Auto-accept needs a
  Spotify URL and a `users` row (`lib/waitlist/auto-accept.ts`), so a
  role-form entrant can only get in by Tim's admin approval.
- `admission-score/v1` (`lib/waitlist/admission-score.ts`) is computed only
  on the chat claim path. The ranked queue sorts role-form entrants last.
- The Mom Test vocabulary exists (`lib/acquisition/conversation-loop.ts`), but
  nobody on the waitlist is asked anything.
- Fixed in #24500: the chat checkout card used to link to the organic
  upsell, which redirected back to `/start` while the profile was neither
  live nor waiting on proof. It now carries `source=intent`, as the claim
  flow does. The per-customer walk (section 3) should still confirm it.
- Customer certification is a spec only. Nothing walks a specific person's
  path with their data before they are let in.
- There are no approved Pen frames for `/waitlist`, `/start` or checkout
  (`docs/design-system/pen-bindings.json`, all `enforce: false`).

## The full system

### 1. Qualify at the door (Mom Test)

Request access asks three things after the email and role:

1. **Which artist are you?** A Spotify artist search (the `HeroSpotifySearch`
   pattern). The server confirms the artist; the client's numbers are never
   trusted.
2. **What's the last thing you did to grow your fans, and how did it go?**
   Free text, optional. Past behavior, not a hypothetical.
3. **What do you pay for today to promote your music?** One tap: nothing,
   under $50 a month, $50 or more a month. Existing spend is the strongest
   buying signal, and asking it this way is not a leading "would you pay"
   question (`isLeadingQuestion`).

Answers are stored raw on `qualification_inputs.momTest` with the question
variant id, so a later variant can be compared against this one.

### 2. Qualification score

- The join route scores the entrant with `admission-score/v1` from the
  server-confirmed artist: identity, audience and, when the catalog read
  succeeds, catalog. The score lands on `qualification_inputs.admissionScore`,
  so the ranked queue orders role-form entrants with everyone else.
- Mom Test answers are recorded but not weighted. v1's own rule holds: do not
  tune weights before paid outcomes exist. A v2 that weights spend and recent
  effort ships only after at least 20 admitted entrants have a paid or
  not-paid outcome.
- The score ranks. It never lets anyone in by itself.

### 3. Certification for each customer

Before an entrant is let in, the system walks their own path with their own
data: build their profile from their Spotify artist, show it with the claim
banner, claim it on a seeded test account, and check out in Stripe test mode.

- Pass: the entrant is certified and becomes eligible to be let in.
- Fail: the first broken surface goes to the bottleneck ranking
  (`scripts/lib/cert-bottleneck.mjs`), gets fixed, and the walk reruns.
- The subject is the `customer-capability` subject from
  [customer certification](design-system/CERTIFICATION_V2_CUSTOMERS.md).
  The walk itself is the certification thread's artist walk. This system
  feeds it the ranked entrants and reads its receipts.
- Built profiles stay unpublished and out of search until Tim approves
  outreach to that person.

### 4. Let in

An entrant is let in when all three hold: they rank inside today's slots,
their own walk passed, and the revenue cone reads `ELIGIBLE` (including
`buyer_would_pay`). Tim's admin approval still overrides, as it does today.

Letting in sends an invite email to someone who asked for access. That path
ships disabled behind `waitlist_settings.auto_accept_enabled` and turns on only
with Tim's yes. Auto-accept also stops requiring a `users` row for role-form
entrants, since the invite is what creates the account.

### 5. Onboarding after let-in

Artists get their own profile with a claim banner (homepage split, locked
2026-11-07). After claim, `/start` interviews only for limits: who they don't
want featured and what they're not okay doing. Everything else is built for
them. Checkout is one tap from the end of onboarding.

### 6. Realtime UI

While the walk builds their profile, the artist sees it being built: the
presence-build task queue (`ONBOARDING_WOW_TASK_QUEUE`) streams each finished
piece into the chat. Views the artist pins persist; views the system creates
are proposals until pinned.

### 7. Loops that improve themselves

- Each cohort's drop-off is read weekly from `server_analytics_events`
  (`artist_signup` funnel). The worst step is the next bottleneck Summer works.
- Question variants run as experiments on request access, compared on
  "reached checkout", not on completion rate.
- Score weights are re-tuned only from paid outcomes, with the minimum above.

## Slices

| Slice | Ships                                                                                                                                      | Pen first?                                                                |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| 1     | This spec; the join route accepts an optional Spotify artist and Mom Test answers, confirms the artist, scores the entrant and stores both | No screen changes                                                         |
| 2     | Request access asks the three questions                                                                                                    | Yes: update the `request-access` brief in `docs/design-system/pen-briefs` |
| 3     | Ranked entrants feed the per-customer walk; receipts gate let-in                                                                           | Claim and checkout frames (already briefed)                               |
| 4     | Auto-invite drain for certified entrants, disabled until Tim says yes                                                                      | Invite email                                                              |
| 5     | Weekly cohort drop-off report and question experiments                                                                                     | No                                                                        |
| 6     | Realtime build view after claim                                                                                                            | Yes                                                                       |

**Ship now:** slice 1. **Re-evaluate when:** 20 entrants have answered the
Mom Test questions, or slice 3's first walk report lands. **Then:** weight
spend in a v2 score if paid outcomes support it, and cut any question that
nobody who reached checkout answered.

**Stop condition** (Tim, 2026-11-07: let products die if usage says so): if 30
qualified, certified entrants are let in and none reaches checkout, stop
building onboarding and put the effort into the offer instead.
