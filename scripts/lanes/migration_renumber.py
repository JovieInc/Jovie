#!/usr/bin/env python3
"""No-model fix for migration number collisions (scripts/check-migration-numbers.mjs).

A PR whose migration is numbered at or below main's latest, or equal to another open PR's, is renumbered to
the next free number. Every open PR computes the same global assignment (ascending PR number, ascending
migration number, new numbers start above everything taken), so several colliding PRs fixing themselves in
parallel do not pick the same new number. The journal is rebuilt as main's entries plus this PR's, and each
renamed snapshot is a three-way merge (PR's base snapshot, PR's snapshot, main's latest snapshot) so it carries
main's schema changes too; a real conflict raises Unmergeable and the model gets the head.

Pure helpers plus `renumber(root, git, base_ref, pr_number, others)` which edits the worktree and returns the
changed paths. The caller commits, merges main and pushes.

After restoring main's metadata and running `pnpm --filter @jovie/web drizzle:generate`, use
`normalize_generated(root, git, base_ref, pr_number, others)` for sparse migration numbering.
It renames generated artifacts without merging or rewriting snapshot contents.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

from atomic_state import atomic_write_text

MIG_DIR = "apps/web/drizzle/migrations"
META = f"{MIG_DIR}/meta"
NUM = re.compile(r"^(\d{4})_([^/]+)\.sql$")
LOG_TEXT = re.compile(r"migration-numbers: FAILED|is not above main's latest|is also added by open PR", re.IGNORECASE)
MISSING = object()


class Unmergeable(Exception):
    pass


def assign(pr_number: int, others: dict[int, list[int]], mine: list[int], base_latest: int) -> dict[int, int]:
    """{old: new} for this PR's migration numbers. `others` maps every other open PR to its migration numbers."""
    everyone = {**{int(k): list(v) for k, v in others.items()}, pr_number: list(mine)}
    counter = max([base_latest, *[n for nums in everyone.values() for n in nums]]) + 1
    used: set[int] = set()
    result: dict[int, int] = {}
    for number in sorted(everyone):
        for old in sorted(everyone[number]):
            if old > base_latest and old not in used:
                used.add(old)
                continue
            new, counter = counter, counter + 1
            used.add(new)
            if number == pr_number:
                result[old] = new
    return result


def three_way(base, mine, theirs):
    """Merge `mine` (the PR) and `theirs` (main) against `base`; MISSING means absent. Raises Unmergeable."""
    if mine == base:
        return theirs
    if theirs == base or mine == theirs:
        return mine
    if isinstance(mine, dict) and isinstance(theirs, dict) and isinstance(base, (dict, type(MISSING))):
        base = base if isinstance(base, dict) else {}
        out = {}
        for key in [*theirs, *[k for k in mine if k not in theirs], *[k for k in base if k not in theirs and k not in mine]]:
            merged = three_way(base.get(key, MISSING), mine.get(key, MISSING), theirs.get(key, MISSING))
            if merged is not MISSING:
                out[key] = merged
        return out
    raise Unmergeable("snapshot conflict")


def _numbers(paths) -> list[int]:
    return sorted({int(m.group(1)) for p in paths if p.startswith(MIG_DIR + "/") and "/" not in p[len(MIG_DIR) + 1:]
                   for m in [NUM.match(p[len(MIG_DIR) + 1:])] if m})


def normalize_generated(root: Path, git, base_ref: str, pr_number: int,
                        others: dict[int, list[int]]) -> list[str]:
    """Keep generated journal indices/timestamps; number new artifacts above main's SQL files.

    Drizzle increments the journal index, which can lag a hand-numbered migration.
    Only append-only generated metadata is accepted. Validate every rename before editing.
    """
    root = Path(root)
    base = json.loads(git("show", f"{base_ref}:{META}/_journal.json"))
    journal_path = root / META / "_journal.json"
    journal = json.loads(journal_path.read_text())
    count = len(base["entries"])
    if journal["entries"][:count] != base["entries"]:
        raise Unmergeable("restore main's metadata and regenerate before normalizing")
    entries = journal["entries"][count:]
    matches = [NUM.fullmatch(f"{entry['tag']}.sql") for entry in entries]
    if not all(matches):
        raise Unmergeable("unsupported generated migration tag")
    paths = git("ls-tree", "-r", "--name-only", base_ref, MIG_DIR).splitlines()
    mapping = assign(pr_number, others, [int(m[1]) for m in matches], max([0, *_numbers(paths)]))
    renames, changed = [], []
    for entry, match in zip(entries, matches):
        old = int(match[1])
        if old not in mapping:
            continue
        tag = f"{mapping[old]:04d}_{match[2]}"
        for before, after in ((f"{MIG_DIR}/{entry['tag']}.sql", f"{MIG_DIR}/{tag}.sql"),
                              (f"{META}/{old:04d}_snapshot.json", f"{META}/{mapping[old]:04d}_snapshot.json")):
            if not (root / before).is_file() or (root / after).exists():
                raise Unmergeable("missing generated artifact or occupied destination")
            renames.append((before, after))
        entry["tag"] = tag
    for before, after in renames:
        (root / before).rename(root / after)
        changed.extend((before, after))
    if changed:
        atomic_write_text(journal_path, json.dumps(journal, indent=2) + "\n")
        changed.append(f"{META}/_journal.json")
    return changed


def renumber(root: Path, git, base_ref: str, pr_number: int, others: dict[int, list[int]]) -> list[str]:
    """Edit the worktree at `root`; `git(*args)` returns stdout. Returns the changed paths, [] when nothing to do."""
    root = Path(root)
    merge_base = git("merge-base", base_ref, "HEAD").strip()
    added = [p for p in git("diff", "--name-only", "--diff-filter=A", f"{merge_base}..HEAD", "--", MIG_DIR).split("\n") if p]
    mine = _numbers(added)
    base_files = [p for p in git("ls-tree", "-r", "--name-only", base_ref, MIG_DIR).split("\n") if p]
    base_latest = max([0, *_numbers(base_files)])
    mapping = assign(pr_number, others, mine, base_latest)
    if not mapping:
        return []
    names = {int(m.group(1)): m.group(2) for p in added for m in [NUM.match(p.rsplit("/", 1)[-1])] if m and p.count("/") == MIG_DIR.count("/") + 1}
    main_journal = json.loads(git("show", f"{base_ref}:{META}/_journal.json"))
    branch_journal = json.loads((root / META / "_journal.json").read_text())
    base_snapshots = sorted(int(m.group(1)) for p in git("ls-tree", "-r", "--name-only", merge_base, META).split("\n")
                            for m in [re.search(r"/(\d{4})_snapshot\.json$", p)] if m)
    main_snapshots = sorted(int(m.group(1)) for p in base_files for m in [re.search(r"/(\d{4})_snapshot\.json$", p)] if m)
    prior = max([n for n in base_snapshots if n < min(mine)], default=None)
    base_snap = json.loads(git("show", f"{merge_base}:{META}/{prior:04d}_snapshot.json")) if prior is not None else {}
    theirs = json.loads(git("show", f"{base_ref}:{META}/{main_snapshots[-1]:04d}_snapshot.json")) if main_snapshots else {}
    changed, entries = [], []
    previous_base, previous = base_snap, theirs
    for old in sorted(mine):
        new = mapping.get(old, old)
        old_tag, new_tag = f"{old:04d}_{names[old]}", f"{new:04d}_{names[old]}"
        sql_old, sql_new = root / MIG_DIR / f"{old_tag}.sql", root / MIG_DIR / f"{new_tag}.sql"
        if old != new:
            sql_old.rename(sql_new)
            changed += [f"{MIG_DIR}/{old_tag}.sql", f"{MIG_DIR}/{new_tag}.sql"]
        snap_old = root / META / f"{old:04d}_snapshot.json"
        if snap_old.exists():
            mine_snap = json.loads(snap_old.read_text())
            merged = three_way(previous_base, {k: v for k, v in mine_snap.items() if k not in ("id", "prevId")},
                               {k: v for k, v in previous.items() if k not in ("id", "prevId")})
            merged = {**mine_snap, **merged, "id": mine_snap.get("id"), "prevId": previous.get("id", mine_snap.get("prevId"))}
            if old != new:
                snap_old.unlink()
                changed.append(f"{META}/{old:04d}_snapshot.json")
            (root / META / f"{new:04d}_snapshot.json").write_text(json.dumps(merged, indent=2) + "\n")
            changed.append(f"{META}/{new:04d}_snapshot.json")
            previous_base, previous = mine_snap, merged
        entry = next((e for e in branch_journal["entries"] if e.get("tag") == old_tag), None)
        if entry:
            entries.append({**entry, "tag": new_tag})
    journal = dict(main_journal)
    rows = list(main_journal["entries"])
    for entry in entries:
        entry["idx"] = int(rows[-1]["idx"]) + 1 if rows else 0
        entry["when"] = max(int(entry.get("when", 0)), int(rows[-1]["when"]) + 1 if rows else 0)
        rows.append(entry)
    journal["entries"] = rows
    (root / META / "_journal.json").write_text(json.dumps(journal, indent=2) + "\n")
    changed.append(f"{META}/_journal.json")
    return sorted(set(changed))
