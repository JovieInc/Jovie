# Design references

The reference corpus (JOV-6040 store, JOV-7081 system): real-world design we
learn from, the art directions we steer by, and the guard that keeps us from
copying either.

- `corpus.json`: `jovie.design-reference-corpus/v1`. Each reference has
  provenance (URL, capture time, method), retrieval tags (`surfaces`, `mood`,
  `technique`, `palette`, `motion`) and a 256-bit perceptual hash.
- `directions/*.json`: `jovie.art-direction/v1` briefs. Each one names its
  references, extracts principles (light, composition, type, motion, color),
  maps them onto Jovie tokens and art canon, and lists anti-goals. At most one
  `active` direction per surface; `proposed` boards wait for a pick.
- `scout-seeds.json`: the curated sites the weekly scout re-captures.

Pixels never enter git or a shipped bundle. Captures live in
`~/.cache/jovie/design-refs` (override with `DESIGN_REFS_CACHE`) and can be
re-captured from the stored URL. References are inspiration only: never ship
a third-party asset, layout, image, copy or mark.

## Use it

Every design task starts with the references and direction for its surface:

```bash
pnpm --filter web design-refs pull --surface homepage            # prompt block
pnpm --filter web design-refs pull --surface golden-path --json  # + image paths
```

Add a reference from a URL (Playwright fold capture, or a direct image fetch)
or from a screenshot file:

```bash
pnpm --filter web design-refs add https://example.com --surface homepage \
  --mood cinematic --technique dark-glass,glow --summary "Why it is good"
pnpm --filter web design-refs add ~/Desktop/shot.png --surface profile --variable hero
```

Intake honours robots.txt (failing closed when it cannot be read), refuses
hosts whose terms forbid scraping (save those by hand and add the file),
refuses bot challenges, and hides consent overlays rather than answering them.
New references land as `proposed`; founder decisions use the JOV-6040
`recordFounderReferenceDecision` path. Retrieval ranks direction references,
then certified, then proposed. Rejected references are never retrieved, but
the anti-copy guard still checks them.

Check work against the corpus (exit 1 on a near-copy):

```bash
pnpm --filter web design-refs guard path/to/screenshot.png
```

The marketing factory's visual review runs the same guard before any judge
and adds the surface's active direction to the judge rubric.

Scout (weekly, about 10 new references, ranked by novelty × seed weight; a
known site only re-enters when its fold changed enough to be a redesign):

```bash
pnpm --filter web design-refs scout --limit 10 [--dry]
pnpm --filter web design-refs directions
```
