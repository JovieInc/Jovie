# Answer-content pipeline

Phase 1 of the content primitive: **idea, then script, then launch**, with the
jov.ie blog as the only launch target. Contract:
`apps/web/lib/content-primitive/contract.ts` (`jovie.content-primitive/v1`).
Its formats, pillars, and characters follow JovieInc/BubblegumFactory
CONTENT.md, so audio, video, and social channels can plug in later without a
new schema. They are typed and rejected at launch until built.

## Flow

1. **Research.** `apps/web/scripts/answer-content/question-map.ts` builds the
   question map (`apps/web/data/answer-content/question-map.json`,
   `jovie.question-map/v1`) from existing credits only:
   - SerpAPI (free plan, 250 searches a month shared with lead discovery):
     Google People Also Ask, related searches, and YouTube titles. A run spends
     at most `--max-searches` (default 30).
   - The last30days skill (`--emit json`): Reddit and TikTok through the
     existing ScrapeCreators key, YouTube titles and top comments through yt-dlp.
   - Exa through AI Gateway (`gateway.tools.exaSearch`) when the key budget
     allows. As of 2026-09-27 every readable gateway key is over its $1 budget,
     so Exa is recorded as unavailable. X has no authenticated source.
   Raw pulls stay out of git. Only the ranked map is committed.
2. **Ideas.** `pipeline.ts ideas` picks the next answer ideas: Jovie relevance
   2 or higher, not already drafted or published, highest priority first, at
   most three a day. Each becomes a Linear issue labeled `content:idea`, which
   Summer turns into an Ovie card for Tim.
3. **Script.** An approved idea is written as an answer article in
   `apps/web/content/answer-drafts/` by a subscription agent lane. No script
   calls a model API. Drafts are not rendered on the site.
4. **Certify.** `pipeline.ts certify` runs machine certification (frontmatter,
   title and description length, slug, a direct first-paragraph answer, depth,
   2 or more cited sources, a Jovie product link, and the `@jovie/copy` lint)
   and appends the result to `apps/web/data/answer-content/launch-ledger.json`.
   A unit test certifies every checked-in draft, so a PR that adds a failing
   draft goes red. The PR `copy-gate` lane also lints added draft lines.
5. **Launch.** `pipeline.ts launch` applies the publish gate:
   - `blocked`: uncertified, or a medium or channel that is not built.
   - `needs_founder_approval`: the first launch of a content type, or fewer
     than 10 consecutive passing certifications, or no standard-tier copy judge
     receipt. File a Linear issue labeled `content:needs-tim-approval`; Summer
     turns it into an Ovie card.
   - `auto_publish`: the founder approved this script, or the type has one
     founder approval plus a 10/10 certification streak plus a judge receipt.
     The draft moves to `apps/web/content/blog/` and ships with the next
     deploy. Answer posts emit FAQPage JSON-LD and use the frontmatter
     description.
6. **Measure.** The nightly SEO certification sweep certifies the live page.
   Search performance joins when Google Search Console is connected.

## Signals for Summer

| Signal | Source | Action |
|---|---|---|
| SEO certification regression | Nightly `SEO Certification Nightly` run fails its ratchet | Mechanical fix through a shipping lane; copy or taste failures to Linear `seo` |
| is-agentic regression | `is-agentic-score` or `is-agentic-essential` failed in the nightly artifact | Linear `seo` issue with the failing check ids |
| New-question backlog | `pipeline.ts ideas` returns candidates | File up to 3 `content:idea` issues a day |
| Launch waiting on Tim | `launch` returns `needs_founder_approval` | One `content:needs-tim-approval` issue per script |
| Content performance | GSC per-page clicks and impressions, once connected | Re-rank the map: demote questions whose answers get no impressions after 30 days |

## Summer instruction bullets (for summer-config)

- Own the loop: research, map, idea, script, certify, launch, measure, re-rank.
  Blog is the only launch target until Tim adds another.
- Refresh the question map at most once a week: one SerpAPI run capped at 30
  searches and one last30days pass capped at 12 topics. Never exceed the cap;
  lead discovery shares the SerpAPI plan.
- Each day, run `pipeline.ts ideas` and file at most 3 Linear issues labeled
  `content:idea` with the printed body. Turn each into an Ovie card. Skip days
  when 3 or more `content:idea` cards are still unanswered.
- When Tim approves an idea card, dispatch the script to a subscription agent
  lane (never a model API key) with the idea body as the brief.
- Run `pipeline.ts certify` on the draft. Failures go back to the writing lane,
  not to Tim.
- Run `pipeline.ts launch`. On `needs_founder_approval`, file one
  `content:needs-tim-approval` issue and card. On Tim's approval, record it in
  the launch ledger with the Linear issue id and relaunch.
- Read the nightly `seo-certification` artifact. Route mechanical failures to
  a shipping lane, copy failures to Linear `seo`, and alert only on a ratchet
  regression or an is-agentic score under 90.
- Do not start audio, video, podcast, social, or artist-facing work.
