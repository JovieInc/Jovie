# pen-par: parallel headless Pen candidates

Run many `pen` CLI agents at once against copies of one Pen file. Every run
adds exactly one new frame, a guard proves nothing pre-existing changed, and
only the new frame ids go to the single Pen writer for promotion into STAGING.
Real `.pen` files are never written.

Measured 2026-10-03 on pen CLI 0.3.10, file format 2.20, 18 MB / 19,758 nodes:

| Input | Parallel | Result | Batch wall | Peak load |
|---|---|---|---|---|
| Full file | 3 | 3/3 | 185 s | 33 |
| Full file | 10 | 0/10 (`get-app-state` timeout) | 474 s | 123 |
| Slice (40–480 KB) | 10 | 10/10 | 230 s | 13 |
| Slice, new homepage frames | 8 | 8/8 | 600 s | 31 |

Cost from `--usage`: Sonnet 5.5 about $0.28 per restyle run and $0.62 per new
page, Opus 5.5 about $1.10 per new page. `--agent claude` runs through the
machine's Claude Code login, so these runs draw on that subscription and its
session limit (a limit hit fails fast with `rate_limit`). No model API keys are
involved.

## Setup

```bash
npm i -g @pen.dev/cli@latest   # check `pen version`; an old CLI parses a newer file as EMPTY
pen login                      # once per machine
claude                         # /login once per machine: the claude agent rides this session
pen codex-login                # only for --agent codex (ChatGPT subscription)
```

Make a scratch copy of the workspace. Keep every `.pen` in its root, because
Pen resolves image paths relative to the file:

```bash
WS=$TMPDIR/pen-par/ws/"Jovie Marketing Workspace"; mkdir -p "$WS"
SRC=~/Documents/Jovie/"Jovie Marketing Workspace"
for d in assets images proof-art product-screenshots hero-studies fonts; do cp -cR "$SRC/$d" "$WS/"; done
find "$SRC" -maxdepth 1 -type f \( -name '*.png' -o -name '*.jp*g' -o -name '*.webp' -o -name '*.glsl' \) \
  -exec cp -c {} "$WS/" \;   # root-level images too: frames reference e.g. generated-54.png
cp -c "$SRC/<file>.pen" "$WS/src.pen"; chmod a-w "$WS/src.pen"
```

## Run

```bash
cd "$WS"
node pen-slice.mjs src.pen slice-<frameId>.pen <frameId>      # per target frame
PEN_WS="$WS" PEN_SLICE=1 pen-fanout.sh jobs.tsv batch1 8        # id agent model target direction
node pen-fanin.mjs slice-<frameId>.pen batch1-run-<id>.pen       # exit 2 = touched existing nodes
pen-export.sh "$WS/batch1-run-<id>.pen" out/<id> <newFrameId>    # png + html-css
```

`jobs.tsv` holds tab-separated `id agent model target_frame direction` rows.
`PEN_MODE=new` with `PEN_BRIEF="..."` builds a fresh frame and uses the target
only as reference. The default mode duplicates the target and restyles the copy.

## Scripts

- `pen-slice.mjs` copies the target frames plus the transitive closure of
  referenced components. Refs inside override objects count too. Only the
  outermost components are lifted, so ids never repeat. Themes and variables
  are kept, and ids are preserved so new frames resolve their refs in the real
  file.
- `pen-fanout.sh` runs the jobs with an `xargs -P` cap, attaches the frontend
  skill, writes one output per job, records `--usage` JSON per job, and
  samples load. It refuses a `PEN_WS` under `~/Documents`.
- `pen-fanin.mjs` is the guard. It diffs each run against its input by
  top-level frame and reports added, removed, changed and reflowed. Key order
  is ignored. Layout drift, meaning x/y/width/height numbers, `null`, and
  `fill_container(0)`, is reported as reflow, not as a change.
- `pen-export.sh` writes a PNG plus `<id>.html` (html-css needs a file path)
  through a throwaway `--out`.

## Gotchas

- Set `NODE_OPTIONS=--network-family-autoselection-attempt-timeout=2000`. The
  scripts already do this. Without it, Node 22 can fail to fetch fonts under
  load: text renders blank, existing frames reflow, and saves write `y: null`.
- Promote new frames only, never a whole output file. Headless saves can
  re-lay out text.
- A full 18 MB input costs every process about 30 s of CPU just to load. Above
  roughly 3 parallel jobs, slice first.
- Remote: every `pen` command, including agent-free export, needs `pen login`
  or `PEN_CLI_KEY` on that machine, and `--agent claude` also needs a Claude
  Code login there ("Not logged in · Please run /login" otherwise).
- A checkerboard where an image should be means the scratch copy is missing
  that asset; check the frame's image `url` against the workspace.

Tests: `node --test scripts/agent/pen-par/pen-par.test.mjs`.
