# Public profile benchmark: methodology

Status: **draft for publication review**. Nothing on this page is a published
claim. Platforms other than Jovie are anonymized as Platform A, B, C.

Naming rule (founder decision, 2026-10-04): another company is named only when
the data is solid, on a marketing page where the claim drives conversion, and
backed by fact. The claims gate enforces this; see "Claims and the gate".

Methodology version: `2026-10-03.3`. Harness:
`scripts/public-benchmark/public-benchmark.mjs`. Claims and gate:
`scripts/public-benchmark/claims.json`. Weekly run:
`.github/workflows/public-benchmark.yml`.

## What we measure

We compare public artist profile pages, the page a fan or an AI agent lands on
from a bio link, across link-in-bio platforms. There are two scores.

1. **Speed.** How fast the profile loads and becomes usable on a phone.
2. **Agent readiness.** How well an AI agent that fetches the page can read
   who the artist is and where their links go, and whether it is allowed to.

## Disclosure

Jovie built and runs this benchmark, and Jovie is one of the platforms
measured. To keep that honest:

- The method, the rubric weights, the margins, and the claims were written down
  before the first run. Changing any of them creates a new methodology version.
  Results from different versions are never compared.
- Raw receipts are kept for every run, including runs where Jovie loses.
- Anyone can rerun the harness with the same command and their own targets
  file.
- Where Jovie loses on a metric, we say so and open engineering work to close
  the gap. We do not drop the metric or change the method.

## Sample

- **Profiles.** Each platform contributes comparable public profiles of
  independent music artists. The first run used each platform's own flagship
  profile (the profile the platform operates for itself) and Jovie's founder
  profile, because Jovie had one public artist profile at the time. That is a
  small sample, and the receipts say so.
- **Matched content (next version).** The fairest comparison is the same artist
  with the same links on every platform, using each platform's default theme.
  This needs accounts on each platform and is a pending decision.
- **Selection rule.** Profiles are chosen by a written rule before
  measurement. They are never swapped after results are seen.

## Politeness and robots.txt

- The harness identifies itself as `JovieBench/1.0` and checks `robots.txt`
  before every page it fetches. If `robots.txt` disallows `JovieBench` (or
  `*`), the harness does not load that page at all, and that platform's speed
  and agent-readiness results are reported as **not measured**. They are never
  scored as zero.
- `robots.txt` that cannot be fetched (server error or network failure) is
  treated as a full disallow, as RFC 9309 requires.
- Lab page loads use a standard headless Chrome, the same as other public
  speed-testing tools. Agent fetches use the `JovieBench` user agent.
- Loads go round-robin across hosts with a pause between them. Each profile is
  loaded about 10 times per weekly run (5 lab runs and 5 rendered runs).

## Speed method

| Setting | Value |
| --- | --- |
| Tool | Lighthouse (version recorded per run), performance category only |
| Device | Lighthouse default mobile emulation |
| Network | Lighthouse default simulated throttling (slow 4G class) |
| Runs | 5 per profile, round-robin across platforms; minimum 3 valid runs |
| Aggregate | Median and p75 per profile; median across a platform's profiles |
| Metrics | LCP, FCP, TBT, CLS, Speed Index, total bytes, request count |
| TTFB | Observed in a fresh, unthrottled browser context from Navigation Timing (`responseStart`), because Lighthouse's simulated value is modelled rather than measured |
| Location | Recorded per run (`harness.region`) |

INP is a field metric and cannot be measured honestly in a lab run with no
user. TBT is the lab proxy. INP will come from public field data (Chrome UX
Report) once that source is enabled.

## Agent-readiness method

Each check scores between 0 and 1. The weights sum to 100.

| Check | Weight | Passes when |
| --- | ---: | --- |
| `robots_ai_access` | 20 | Fraction of 12 named AI agents (GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, Claude-User, Claude-SearchBot, PerplexityBot, Perplexity-User, Google-Extended, Applebot-Extended, Amazonbot, meta-externalagent) that `robots.txt` allows on the profile |
| `raw_html_ok` | 10 | A plain HTTP fetch, without JavaScript, gets a 200 HTML page rather than a block or challenge |
| `link_extractability` | 20 | Fraction of the outbound link domains a human sees in the rendered page that also appear as links in the raw HTML |
| `identity_in_raw_html` | 10 | The artist name shown on the rendered page appears in the raw HTML text |
| `json_ld_entity` | 15 | Raw HTML has JSON-LD for a Person, MusicGroup, ProfilePage or Organization (2/3), with `name` and `sameAs` (full) |
| `llms_txt` | 10 | The origin serves a non-empty `/llms.txt` as text |
| `markdown_negotiation` | 10 | The profile answers `Accept: text/markdown` with Markdown |
| `machine_interface` | 5 | The origin publishes an MCP, OpenAPI or AI plugin manifest at a well-known path |

If the agent fetch is blocked (any non-200 or non-HTML answer), the link and
identity checks score 0: an agent that is turned away can read nothing. If no
browser load succeeds, they are not measured.

The raw-HTML checks model what most agent fetch tools see: they do not run
JavaScript. The rendered page is the ground truth for what a person sees, so
no hand-written answer key is involved.

If any check cannot be measured (for example, `robots.txt` disallows the
harness), the platform's score is **not measured**, not zero. A check that
does not apply (a profile with no outbound links has nothing to extract) is
dropped, and the score is rescaled over the remaining weights.

An LLM task battery (an agent answering "what is this artist's latest release?"
from the page) is planned as a later methodology version. Version 1 is
deterministic so that anyone can reproduce it exactly.

## Claims and the gate

A claim is "Jovie beats every measured comparator on metric X". It passes only
if:

- every comparator platform has a measured value (a missing comparator makes
  the verdict *unknown*), and
- for speed, Jovie's median is more than 10% lower than each comparator's
  median (a tie, including 0 against 0, is not a win), or
- for agent readiness, Jovie leads each comparator by at least 10 points.

Claim states in `claims.json`:

- `candidate`: measured but not enforced. A failing candidate gets
  gap-closing engineering work.
- `holding`: passed the last run. The weekly workflow fails if it stops
  passing or loses evidence.
- `certified`: holding and approved for publication. Only a founder decision
  sets this state; the harness never does.

A claim that names a competitor (`publication.namesCompetitors`) must be
`certified` and carry a full publication record: the marketing page path
(`surface`), what the claim buys (`conversionGoal`), the proof registry claim
id (`proofClaimId`), the benchmark receipt, and `certifiedBy: founder` with a
date. A certified claim also fails the gate unless its receipt comes from the
hosted runner, never a laptop. The unit tests check the committed claims file
against this rule on every PR.

## Reproduce it

```bash
pnpm install
node scripts/public-benchmark/public-benchmark.mjs run \
  --targets /path/outside/repo/targets.json --runs 5 --out ./bench-out
node scripts/public-benchmark/public-benchmark.mjs gate \
  --receipt ./bench-out/receipt-YYYY-MM-DD.json
```

`targets.json` lists platforms with anonymized ids (`platform-a`, ...) and
profile URLs:

```json
{
  "platforms": [
    {
      "id": "platform-a",
      "profiles": [{ "id": "p1", "url": "https://example.com/artist" }]
    }
  ]
}
```

Each run writes a private receipt (with URLs) and an anonymized receipt. In the
anonymized receipt, each competitor profile URL is replaced by a SHA-256 prefix
that anyone with the targets file can check.

## Known limitations

- Lab results depend on the runner's location and network. Each receipt
  records the runner, and comparisons only use runs taken on the same runner
  in the same session.
- A flagship profile is not a typical profile. Matched-content profiles are the
  next step.
- Platforms that disallow automated agents in `robots.txt` cannot be measured
  by this harness. For speed, the planned answer is public field data from the
  Chrome UX Report, which requires no page loads.

## First hosted run (2026-10-04)

Receipt: `scripts/public-benchmark/receipts/2026-10-04-hosted.json`
(methodology `2026-10-03.3`, GitHub `ubuntu-latest`, 5 runs per profile,
run 37203734926).

| Median | Jovie | Platform A | Platform B | Platform C |
| --- | ---: | ---: | ---: | ---: |
| LCP (simulated mobile) | 6.03 s | not measured | 12.41 s | 7.50 s |
| TBT | 342 ms | not measured | 609 ms | 617 ms |
| CLS | 0 | not measured | 0.017 | 0.001 |
| TTFB (unthrottled) | 20 ms | not measured | not measured | 406 ms |
| Total bytes | 1.26 MB | not measured | 4.27 MB | 1.28 MB |
| Agent readiness | 90 | not measured | 30 | 38.3 |

Every comparative claim stays *unknown* while Platform A is unmeasured.
Against B and C, Jovie leads on LCP, TBT, CLS, TTFB and agent readiness, but
is only 1% lighter than C on bytes, inside the 10% margin, so the bytes claim
fails. A 6 s simulated-mobile LCP on the hosted runner is also slow in
absolute terms. The hosted runner's CPU is slower than the laptop's, which
Lighthouse's simulation amplifies.

## First dry run (2026-10-04, not publishable)

Receipt: `scripts/public-benchmark/receipts/2026-10-04-local-dry-run.json`
(methodology `2026-10-03.3`, local runner, 5 runs per profile). The runner's
network was degraded (TCP connect 0.2 to 1.5 s to every host), so absolute
LCP and TTFB values are not publishable. Byte weight, request count, TBT, CLS
and the agent rubric depend far less on the network.

| Median | Jovie | Platform A | Platform B | Platform C |
| --- | ---: | ---: | ---: | ---: |
| LCP (simulated mobile) | 1.91 s | not measured | 12.74 s | 11.04 s |
| TBT | 29 ms | not measured | 160 ms | 55 ms |
| CLS | 0 | not measured | 0.018 | 0 |
| Total bytes | 1.26 MB | not measured | 4.25 MB | 1.21 MB |
| Requests | 104 | not measured | 133 | 68 |
| Agent readiness | 90 | not measured | 30 | 47.9 |

Every comparative claim is *unknown* because Platform A's `robots.txt`
disallows the harness. Against B and C alone, Jovie loses on bytes to C (4%
heavier), ties C on CLS, and wins the rest. Jovie's agent score lost 10 points
for not answering `Accept: text/markdown` on profiles. Platform B answered the
agent fetch with HTTP 403, so its raw-HTML checks score 0.

## Version history

- `2026-10-03.3`: the JSON-LD check scores the most complete entity on the
  page, as the rubric states, instead of the first one. The first dry run had
  scored a ProfilePage without `sameAs` while the page's MusicGroup had both
  fields. Applies to every platform.
- `2026-10-03.2`: a blocked agent fetch scores 0 on link extraction instead
  of "not applicable"; a failed browser render is "not measured". Found in the
  first dry run before any result was published; that run's receipt is kept.
- `2026-10-03.1`: first version.
