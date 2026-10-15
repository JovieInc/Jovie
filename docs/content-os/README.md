# Content OS P0

Refs JOV-8127. Parent: JOV-8128. This repo-local command produces a complete
research and script package for Tim's line-by-line feedback. It uses the existing
authenticated Codex subscription transport; no new service or API key is needed.
Use the repository's pinned Node and pnpm versions and an authenticated `codex`.

The [first real episode and lock/regenerate receipt](dogfood/README.md) are checked in.

```sh
pnpm jovie script "Why do people selectively apply moral standards?"
pnpm jovie script --input ./voice-note.txt --output ./my-episode
pnpm jovie script show ./my-episode
pnpm jovie script lock ./my-episode B2
pnpm jovie script regenerate ./my-episode --feedback "Shorten the opening and repair the transition into B2."
pnpm jovie script unlock ./my-episode B2
```

The command defaults to the subscription CLI's configured model. An explicit
`--model openai/<model>` selects a model available to that subscription. Generation
runs four stages: competing hypotheses, live research with a claim ledger,
adversarial review with thesis revision, then the essay and spoken vlog script.
Regeneration reuses the source register and ledger, then repeats review and writing.
Raw input is a hypothesis, not an approved factual account. Research must produce
a completed native live-search receipt and at least two distinct HTTPS sources.
Claims separate factual, causal, incentive and normative assertions, with confidence,
source IDs and counterevidence. The final thesis may differ from the provisional one.

Each spoken block has a stable `B` ID and claim references. Lock a sentence or
paragraph by its ID. The writer sees its original text and must compose the
surrounding transitions around it. Code reinserts the original text and claim
references exactly, including whitespace, Unicode and line breaks. Missing,
duplicated or reordered anchors fail generation. Unlocking is an explicit revision.
Locks apply to the spoken script; the essay remains an independently editable draft.

`project.jsonl` is the authoritative artifact. Each line is a complete revision,
including raw input, research, review, essay, spoken blocks, global canon reference
and active locks. Snapshots carry a SHA-256 chain to detect accidental edits.
Do not edit history in place. `script show <directory> --json` exposes the current
snapshot. Inspect older JSONL entries for earlier lock states. To export Markdown:

```sh
pnpm --silent jovie script show ./my-episode > ./my-episode/package.md
```

Existing projects are never overwritten. Concurrent generation detects a changed
head before appending. Invalid model output gets one bounded correction attempt;
provider failures or repeated validation failures leave the prior revision intact.
A crash while saving can leave `.write-lock`; after confirming no writer is still
running, remove only that project's lock file and retry. An interrupted append
fails the integrity check; restore the log from its last complete saved copy.
Projects default to `content-projects/<uuid>`. Keep private ideas outside the repo
or exclude their output directory from version control.

EVENT: Content OS references the global `character:tim-white` identity; project
generation cannot invent a local Tim persona or wardrobe.

Global identity resolves through [content-os.json](../../canon/content-os.json),
which pins the existing Ops Tim White canon. It contains no locally invented Tim
persona. The wardrobe collection is globally referenced and bounded to seven
approved outfits; stable character, prop and location references and a nullable
SequenceState remain available for continuity. Voice comes from the existing
`founder-tim` register in `@jovie/copy` and [VOICE.md](../../canon/VOICE.md).

The existing-work audit found the Ops Tim canon and historic `02-content` workspace
references in the original Content Agent issue (#9822). That issue concerns profile
audits, not a reusable script generator. Bubblegum Factory is reference context;
this pipeline and its artifacts stay Jovie-native. The public `@jovie/cli` package
keeps its existing remote command contract; `pnpm jovie` is the repo-local authoring
entry point. Prior art adopted: Node argument parsing and filesystem persistence,
plus the existing subscription model transport, rather than a new CLI framework.

Research receipts prove tool use and structural validation, not factual entailment
or creative quality. These are drafts for Tim's feedback. Source evidence and the
adversarial review are visible so factual corrections can be made before recording.
The command makes four subscription calls per initial generation, two per normal
regeneration, and at most one correction per stage. Calls retain the transport's
four-minute deadline. There are no background jobs or recurring API costs.

Ship now: this CLI loop and exact lock preservation. Re-evaluate when a real stage
fails both validation attempts or exceeds its four-minute deadline. Then inspect
the provider error and source ledger before changing the bounded generation policy.

Verification:

```sh
node --import tsx --test --test-isolation=none --experimental-test-coverage --test-coverage-include='scripts/content-os/*.mts' scripts/content-os/project.test.mts
pnpm --filter @jovie/copy exec vitest run transport.test.ts judge.test.ts
pnpm run typecheck:scripts
```

The deterministic content tests also run in the existing CI script-contract lane.
They cover staged research, revisable thesis, transcript input, lock/unlock,
repeated regeneration, exact bytes, source/citation failures, history integrity,
stale writes and provider failure recovery. Live generation is separate evidence.
