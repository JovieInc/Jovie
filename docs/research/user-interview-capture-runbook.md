# Founder user-interview capture runbook

Goal: turn each founder call with a real new user into a transcript in gbrain
that Summer can rank into activation issues. Nothing here contacts users;
scheduling and outreach stay with the founder.

## What is connected (checked 2026-10-28)

| Tool | State |
| --- | --- |
| Granola desktop app | Installed on the founder Mac. Records locally, no bot joins the call. |
| Granola MCP plugin | Present but not authenticated. Run its `authenticate` tool once to let agents read notes and transcripts. |
| Fireflies MCP plugin | Present but not authenticated. Not needed. |
| gbrain CLI / MCP | Working. Destination for transcripts. |

Lightest path: Granola on the founder's Mac, then one `gbrain put`. No new tool,
no new spend.

## Before the call

1. Tell the user the call is recorded for product research and ask for a yes on
   the recording. If they say no, take notes only.
2. Open Granola, start the meeting note, join the call.
3. Open the user's replay first if one exists: ask Summer for
   `GET /api/internal/ovie/summer-company/stuck-signups`. Replays are buffered
   and sent only on a trigger (idle or left on claim/pricing, onboarding
   stalled or abandoned, client error, new signup, profile claimed), within a
   45-per-month cap, so a user may have none. Check `flush_trigger` on the
   `signup_replays` row to see why one exists.

## Questions (stuck before claim)

- What were you trying to do when you came to Jovie?
- Walk me through what happened after you signed up. What did you expect next?
- Where did you stop, and why?
- What would you have used instead?

## After the call (5 minutes)

1. In Granola, copy the transcript and the AI notes into one markdown file,
   `interview.md`.
2. Redact before saving: emails, phone numbers, full last names, handles of
   third parties. Keep the first name and the user id only.
3. Add this header to the top of the file:

   ```
   ---
   type: user-interview
   date: YYYY-MM-DD
   participant: <first name>
   user_id: <internal users.id>
   replay_ids: [<32-hex sentry replay ids>]
   consent_recorded: true
   ---
   ```

4. Store it:

   ```bash
   gbrain put research/user-interviews/YYYY-MM-DD-<first-name> < interview.md
   ```

## Summer's follow-up

Summer reads new pages under `research/user-interviews/` (`gbrain list` /
`gbrain query`), pairs each with the replay links from the stuck-signups
endpoint, and files one Linear issue per distinct blocker, ranked by how many
users hit it and how early in the funnel it happens. Each issue cites the
transcript slug and replay ids, never the raw transcript.

## Not used

- Fireflies: no need for a second recorder.
- Heatmaps: not useful at this volume (see the replay evidence PR).

## Replay budget

Replays are buffered in the browser and sent only on a trigger, so the free
Sentry plan (50 a month) stays enough. The server stops allowing sends at 45
per billing period (period starts on the 24th UTC) and logs every send and
every suppression as `[replay-flush]` with its trigger. If suppressions show
up in the logs, the paid tier ($15 a month for 5k) is an option for Tim to
choose later; it has not been bought.
