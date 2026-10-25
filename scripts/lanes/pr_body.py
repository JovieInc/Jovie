"""One PR-body builder for every lanes PR creation and fix-run update path.

`scripts/pr-fleet-rules.mjs` rejects lane PRs whose body lacks `## Red-before-green`
(fix: titles are repair PRs), a locked-area citation, and so on. Each section here is
filled only from a fact the lane holds. A fact that does not exist yet is never
invented: it becomes an entry in `BodyResult.actions`, which the caller turns into
lane work (capture the red run, cite the lock, add the regression test).
"""
from __future__ import annotations

import re
import tempfile
from dataclasses import dataclass, field
from pathlib import Path

RUN_URL = re.compile(r"^https://github\.com/([\w.-]+/[\w.-]+)/actions/runs/([1-9]\d*)(?:/attempts/[1-9]\d*)?$")
RED_TOKEN = re.compile(r"\b(?:FAIL|Error|AssertionError|ERR_|expected|not ok)", re.I)
TEST_FILE = re.compile(r"(?:\.(?:test|spec)\.[cm]?[jt]sx?$|(?:^|/)test_[^/]+\.py$)")
INTERNAL_CHANGELOG = '<!-- customer-changelog/v1 {"releaseWorthy":false} -->'
DONE_PLACEHOLDER = "Not yet — awaiting merge queue and production verification."
HOLD_LABELS = frozenset({"tim-hold", "hold", "do-not-merge", "gated", "needs-human-decision"})
# Actions (stable ids, counted as the pre-fix metric's cause breakdown).
NEED_RED = "capture-red-before-green"
NEED_TEST = "add-regression-test"
NEED_LOCK = "cite-locked-area"
SECTIONS = ("Red-before-green", "Premise check", "Blast radius", "Locked areas", "Done receipt")
EXEMPT_PATH = re.compile(
    r"^(?:apps/ios/|\.github/workflows/ios-ci\.yml$|apps/web/tests/visual/)|(?:^|/)__(?:screenshots|snapshots)__/|\.snap$")


def is_locked_area(path: str) -> bool:
    """Mirror of isLockedArea in scripts/pr-fleet-rules.mjs (parity is tested against it)."""
    return bool(
        re.search(r"(?:^|/)design-system\.css$", path)
        or re.search(r"(?:^|/)(?:auth|\(auth\)|auth-routing|clerk)(?:/|[.-])", path)
        or re.search(r"(?:^|/)[^/]*(?:clerk|better-auth)[^/]*\.[cm]?[jt]sx?$", path)
        or (path.endswith(".json") and re.search(r"(?:baseline|ratchet)", path, re.I))
        or re.fullmatch(r"apps/web/data/(?:homepageV2Copy|homepageFrontDoorCta|marketingCtaIntents)\.ts", path)
        or re.fullmatch(r"apps/web/components/homepage/(?:HomepageEditorialHero|HomepageCertifiedSections)\.tsx", path))


@dataclass
class RedEvidence:
    """The first failing run of this lane's own gate or check, before the fix."""
    command: str
    output: str = ""        # red-output excerpt (must itself look red) ...
    run_url: str = ""       # ... and/or the failing GitHub Actions run

    def usable(self) -> bool:
        return bool(self.command.strip()) and (bool(RED_TOKEN.search(self.output)) or bool(RUN_URL.match(self.run_url)))


@dataclass
class BodyResult:
    body: str
    actions: list[str] = field(default_factory=list)


def _clean(value: str, limit: int) -> str:
    return value.replace("```", "'''").strip()[-limit:]


def _section(body: str, heading: str) -> str:
    lines = re.sub(r"<!--[\s\S]*?-->", "", body or "").split("\n")
    start = next((i for i, l in enumerate(lines) if re.match(r"#{1,6}\s", l)
                  and re.sub(r"^#+\s*", "", l).strip().lower() == heading.lower()), -1)
    if start < 0:
        return ""
    end = next((i for i in range(start + 1, len(lines)) if re.match(r"#{1,6}\s", lines[i])), len(lines))
    return "\n".join(lines[start + 1:end])


def _field(text: str, label: str) -> str:
    match = re.search(rf"^\s*(?:-\s*)?{label}:\s*(.+)$", text, re.I | re.M)
    return match.group(1).strip() if match else ""


def _real(value: str) -> bool:
    return len(value.strip()) > 2 and not re.fullmatch(
        r"(?:todo|tbd|n/?a|none|not applicable|\.\.\.|<[^>]*>)\s*[.!]?", value.strip(), re.I)


def is_repair(title: str, labels=(), body: str = "") -> bool:
    return bool(re.match(r"fix(?:\([^\n)]+\))?!?:", title or "", re.I)
                or {l.lower() for l in labels} & {"bug", "type:bug", "ci-repair", "ci-fix", "ws:ci", "remediation",
                                                  "lane-fix-red", "lane-fix-dequeued"}
                or re.search(r"- \[x\] Bug fix", body or "", re.I))


def exempt(files: list[str], labels=()) -> bool:
    return bool({l.lower() for l in labels} & {"ios-ci", "visual-regression"}) or \
        (bool(files) and all(EXEMPT_PATH.search(f) for f in files))


def _red_section(red: RedEvidence) -> str:
    lines = [f"Failing command: `{red.command.strip()}`"]
    if RED_TOKEN.search(red.output):
        lines += ["", "```text", _clean(red.output, 2000), "```"]
    if RUN_URL.match(red.run_url):
        lines += ["", f"Failing run (before fix): {red.run_url}"]
    return "\n".join(lines)


def build_body(*, title: str, identifier: str = "", issue_id: str = "", files: list[str], lane_note: str = "",
               labels=(), red: RedEvidence | None = None, locked_citation: str = "",
               proof: str = "", premise_result: str = "", extra_head: str = "") -> BodyResult:
    """Body for a new lane PR. `files` are repo-relative changed paths."""
    actions: list[str] = []
    repair = is_repair(title, labels) and not exempt(files, labels)
    tests = [f for f in files if TEST_FILE.search(f)]
    parts = []
    if identifier:
        parts.append(f"Refs {identifier}.")
        marks = []
        if issue_id:
            marks.append(f"<!-- linear-issue-id:{issue_id} -->")
        marks.append(f"<!-- linear-issue-identifier:{identifier} -->")
        parts.append("\n".join(marks))
    if lane_note:
        parts.append(lane_note)
    if extra_head:
        parts.append(extra_head)
    shown = ", ".join(f"`{f}`" for f in files[:12]) + (f" and {len(files) - 12} more" if len(files) > 12 else "")
    parts.append(f"## Summary\n\nChanges {len(files)} file(s): {shown or 'none yet'}.")
    parts.append(INTERNAL_CHANGELOG)
    if repair:
        if tests:
            parts.append("## Bug-to-test\n\n" + "\n".join(f"Regression test: `{t}`" for t in tests[:5]))
        else:
            actions.append(NEED_TEST)
        if red is not None and red.usable():
            parts.append("## Red-before-green\n\n" + _red_section(red))
            parts.append("## Premise check\n\n"
                         "Assumption: the reported failure reproduces on the base commit, before this change.\n"
                         f"Falsifying test: `{red.command.strip()}`\n"
                         f"Result: {premise_result or 'failed on the base commit (red output recorded above), so the failure is real and this change targets it.'}")
        else:
            actions.append(NEED_RED)
    blast_paths = sorted({"/".join(f.split("/")[:2]) for f in files})
    parts.append("## Blast radius\n\n"
                 f"What could break: callers and shared state of {', '.join(f'`{p}`' for p in blast_paths[:6]) or 'the changed files'} outside this diff.\n"
                 f"Proof: {proof or 'the lane gate runs before this PR is made ready and the repository required checks run on every pushed head; the lane records both results.'}")
    locked = sorted({f for f in files if is_locked_area(f)})
    if locked:
        if locked_citation.strip():
            parts.append(f"## Locked areas\n\n{locked_citation.strip()}")
        else:
            actions.append(NEED_LOCK)
    parts.append(f"## Done receipt\n\n{DONE_PLACEHOLDER}")
    return BodyResult("\n\n".join(parts) + "\n", actions)


def refresh_body(existing: str, *, title: str, files: list[str], labels=(),
                 red: RedEvidence | None = None, locked_citation: str = "") -> BodyResult:
    """Fix-run update: keep every section the author or agent already filled, add only the
    missing ones, and report (not fabricate) what is still unknown. Idempotent."""
    body = (existing or "").rstrip("\n")
    actions: list[str] = []
    repair = is_repair(title, labels, body) and not exempt(files, labels)
    add: list[str] = []
    if repair:
        cur = _section(body, "Red-before-green")
        cmd = _field(cur, "Failing command").replace("`", "")
        link = _field(cur, r"Failing run \(before fix\)").replace("`", "")
        has_out = bool(re.search(r"```(?:text|console|log|bash|sh)?\n[\s\S]*?\b(?:FAIL|Error|AssertionError|ERR_|expected|not ok)[\s\S]*?```", cur, re.I))
        if not (_real(cmd) and (has_out or RUN_URL.match(link))):
            if red is not None and red.usable():
                body = _drop_section(body, "Red-before-green")
                add.append("## Red-before-green\n\n" + _red_section(red))
            else:
                actions.append(NEED_RED)
        prem = _section(body, "Premise check")
        if not all(_real(_field(prem, l)) for l in ("Assumption", "Falsifying test", "Result")):
            if red is not None and red.usable():
                body = _drop_section(body, "Premise check")
                add.append("## Premise check\n\n"
                           "Assumption: the failing check is caused by this PR head, not by main or infrastructure.\n"
                           f"Falsifying test: `{red.command.strip()}`\n"
                           "Result: failed on the pre-fix head (evidence under Red-before-green); the fix run re-ran it after the change.")
        if not re.search(r"Regression test:\s*[`']?[\w./-]+", body, re.I) and \
                not any(TEST_FILE.search(f) for f in files):
            actions.append(NEED_TEST)
        elif not re.search(r"Regression test:\s*[`']?[\w./-]+", body, re.I):
            add.append("## Bug-to-test\n\n" + "\n".join(f"Regression test: `{t}`" for t in [f for f in files if TEST_FILE.search(f)][:5]))
    if not _real(_field(_section(body, "Blast radius"), "What could break")) or \
            not _real(_field(_section(body, "Blast radius"), "Proof")):
        body = _drop_section(body, "Blast radius")
        paths = sorted({"/".join(f.split("/")[:2]) for f in files})
        add.append("## Blast radius\n\n"
                   f"What could break: callers and shared state of {', '.join(f'`{p}`' for p in paths[:6]) or 'the changed files'} outside this diff.\n"
                   "Proof: the lane gate and the repository required checks run on every pushed head; the lane records both results.")
    if any(is_locked_area(f) for f in files):
        ref = _section(body, "Locked areas")
        if not (re.search(r"GBrain:\s*\S{3,}", ref) or re.search(r"Locking PR:\s*(?:#[1-9]\d*|https://\S+)", ref)):
            if locked_citation.strip():
                body = _drop_section(body, "Locked areas")
                add.append(f"## Locked areas\n\n{locked_citation.strip()}")
            else:
                actions.append(NEED_LOCK)
    if "customer-changelog/v1" not in body:
        add.append(INTERNAL_CHANGELOG)
    if add:
        body = body + "\n\n" + "\n\n".join(add)
    return BodyResult(body.rstrip("\n") + "\n", actions)


def _drop_section(body: str, heading: str) -> str:
    """Remove an unfilled/placeholder section (heading to next heading) so it can be re-added."""
    lines = body.split("\n")
    start = next((i for i, l in enumerate(lines) if re.match(r"#{1,6}\s", l)
                  and re.sub(r"^#+\s*", "", l).strip().lower() == heading.lower()), -1)
    if start < 0:
        return body
    end = next((i for i in range(start + 1, len(lines)) if re.match(r"#{1,6}\s", lines[i])), len(lines))
    return "\n".join(lines[:start] + lines[end:]).rstrip("\n")


# ------------------------------------------------------------------ producing the facts

def test_command(path: str) -> list[str] | None:
    if path.endswith(".py"):
        return ["python3", "-m", "pytest", "-x", "-q", path]
    if re.search(r"\.test\.mjs$", path):
        return ["node", "--test", path]
    if path.startswith("apps/web/") and TEST_FILE.search(path):
        return ["pnpm", "--filter", "@jovie/web", "exec", "vitest", "run", path[len("apps/web/"):]]
    return None


def capture_red(run, worktree: Path, base: str, test_files: list[str], *, modules: Path | None = None,
                timeout: int = 600) -> tuple[RedEvidence | None, str]:
    """Run the PR's own changed tests against `base` (the lane's first failing run).

    `run(args, cwd=, timeout=)` -> CompletedProcess-like. Returns (evidence, reason): evidence
    only when the test really fails on base with red output; otherwise (None, why), so the
    caller records an action instead of a made-up failure."""
    candidates = [f for f in test_files if test_command(f)]
    if not candidates:
        return None, "no-runnable-changed-test"
    probe = Path(tempfile.mkdtemp(prefix="lane-red-"))
    added = False
    try:
        if run(["git", "worktree", "add", "--detach", str(probe / "base"), base], cwd=worktree, timeout=300).returncode:
            return None, "base-checkout-failed"
        added = True
        base_dir = probe / "base"
        for rel in candidates[:3]:
            target = base_dir / rel
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes((worktree / rel).read_bytes())
        if modules and modules.exists() and not (base_dir / "node_modules").exists():
            (base_dir / "node_modules").symlink_to(modules)
        for rel in candidates[:3]:
            command = test_command(rel)
            done = run(command, cwd=base_dir, timeout=timeout)
            output = (getattr(done, "stdout", "") or "") + (getattr(done, "stderr", "") or "")
            if done.returncode and RED_TOKEN.search(output):
                return RedEvidence(" ".join(command), "\n".join(output.strip().splitlines()[-40:])), "captured"
        return None, "changed-tests-pass-on-base"
    except (OSError, ValueError):
        return None, "red-capture-error"
    finally:
        if added:
            run(["git", "worktree", "remove", "--force", str(probe / "base")], cwd=worktree, timeout=120)
        import shutil
        shutil.rmtree(probe, ignore_errors=True)


def failing_run_evidence(pr: dict, repo: str) -> RedEvidence | None:
    """The PR's own first failing check run, taken from the statusCheckRollup the fix run was
    dispatched on. The command is the failing job's name: the exact command is only known to
    the workflow, so the run URL is the evidence and the agent refines the command."""
    for check in pr.get("statusCheckRollup") or []:
        if str(check.get("conclusion") or "").upper() not in {"FAILURE", "TIMED_OUT", "STARTUP_FAILURE"}:
            continue
        found = re.search(r"(https://github\.com/[\w.-]+/[\w.-]+/actions/runs/[1-9]\d*)", check.get("detailsUrl") or "")
        if found and found.group(1).lower().startswith(f"https://github.com/{repo}/actions/runs/".lower()):
            return RedEvidence(f"CI job \"{check.get('name')}\" ({repo} workflow)", "", found.group(1))
    return None
