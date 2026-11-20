"""Canonical measured-Win validation for the existing PR repair loop."""
import json
from pathlib import Path
import re
import subprocess
import tempfile

from atomic_state import atomic_write_text


ROOT = Path(__file__).resolve().parents[2]


def validate(win_section: str) -> None:
    if not isinstance(win_section, str) or not re.match(r"\A## Win\s*\n", win_section):
        raise ValueError("measured win requires a complete ## Win section")
    if re.search(r"^#{1,6}\s+|customer-changelog/v1", win_section.split("\n", 1)[1], re.M):
        raise ValueError("measured win must contain only Win evidence; use the dedicated repair fields")
    # Use the same policy as Fleet; never publish a repair that will fail it again.
    checked = subprocess.run(["node", "--input-type=module", "-e", """
import { readFileSync } from 'node:fs';
import { requiredWinErrors, winSectionErrors } from './scripts/lib/wins-ledger.mjs';
const body = readFileSync(0, 'utf8');
console.log(JSON.stringify([
  ...requiredWinErrors({ labels: ['compounding'], body }), ...winSectionErrors(body),
]));
"""], cwd=ROOT, input=win_section, text=True, capture_output=True, check=True, timeout=10)
    problems = json.loads(checked.stdout)
    if problems:
        raise ValueError("measured win policy: " + "; ".join(problems))


GUARD = ".github/workflows/company-guards.yml"
CERT = ".github/workflows/public-app-certification.yml"
ONE_PIN = "company guard Win requires one modified workflow pin"
GUARD_CLAIM = "Bring the shared company guard pin up to the verified upstream target."
BOTH_CLAIM = (
    "Bring the shared company guard and public-app certification pins up to the verified upstream target."
)
MACHINE_FILES = frozenset({
    "scripts/lanes/repair_win.py",
    "scripts/lanes/fix_red_measured_win.py",
    "scripts/lanes/fix_red_mixed_repairs.py",
    "scripts/lanes/fix_red_compose.py",
    "scripts/lanes/fix_red_classes.py",
    "scripts/tests/test_repair_win.py",
    "scripts/tests/test_fix_red_classes.py",
    "scripts/tests/test_fix_red_mixed_repairs.py",
    "scripts/tests/test_fix_red_compose.py",
    "scripts/tests/test_workflow_job_gate.py",
})
_CERT_USES = re.compile(
    r"^([+-])    uses: JovieInc/ci/\.github/workflows/public-app-certification\.yml@([0-9a-f]{40})\Z")
_CERT_REF = re.compile(r"^([+-])      ci-ref: ([0-9a-f]{40})\Z")


def _forward_count(comparison, old: str, new: str, message: str, *, repository="JovieInc/ci") -> int:
    url = f"https://github.com/{repository}/compare/{old}...{new}"
    count = comparison.get("ahead_by")
    commits = comparison.get("commits")
    if (comparison.get("html_url") != url or comparison.get("status") != "ahead"
            or type(count) is not int or count <= 0
            or type(comparison.get("behind_by")) is not int or comparison["behind_by"] != 0
            or type(comparison.get("total_commits")) is not int or comparison["total_commits"] != count
            or (comparison.get("base_commit") or {}).get("sha") != old
            or (comparison.get("merge_base_commit") or {}).get("sha") != old
            or not isinstance(commits, list) or len(commits) != count
            or any(not isinstance(commit, dict) or not isinstance(commit.get("sha"), str)
                   or not re.fullmatch(r"[0-9a-f]{40}", commit["sha"]) for commit in commits)
            or len({commit["sha"] for commit in commits}) != count
            or commits[-1]["sha"] != new):
        raise ValueError(message)
    return count


def _adopted_count(adopted, new: str, message: str, *, repository="JovieInc/ci") -> int:
    if (not isinstance(adopted, dict)
            or adopted.get("html_url") != f"https://github.com/{repository}/compare/{new}...{new}"
            or adopted.get("status") != "identical"
            or any(type(adopted.get(key)) is not int or adopted[key] != 0
                   for key in ("ahead_by", "behind_by", "total_commits"))
            or adopted.get("commits") != []
            or any(not isinstance(adopted.get(key), dict) or adopted[key].get("sha") != new
                   for key in ("base_commit", "merge_base_commit"))):
        raise ValueError(message)
    return adopted["ahead_by"]


def _guard_pins(workflow: dict) -> tuple[str, str]:
    patch = workflow.get("patch")
    if not isinstance(patch, str):
        raise ValueError("company guard pin patch unavailable")
    changed = [line for line in patch.splitlines() if line.startswith(("+", "-"))]
    pins = {}
    for sign in ("-", "+"):
        for marker in ("company-guards.yml@", "ci-ref: "):
            matches = [re.fullmatch(re.escape(sign + "# " + marker) + r"([0-9a-f]{40})", line)
                       for line in changed]
            matches = [match.group(1) for match in matches if match]
            if len(matches) != 1:
                raise ValueError("company guard Win requires both exact old and new pins")
            pins[sign, marker] = matches[0]
    old, new = pins["-", "ci-ref: "], pins["+", "ci-ref: "]
    if len(changed) != 4 or old == new or any(
            pins[sign, "company-guards.yml@"] != pins[sign, "ci-ref: "] for sign in ("-", "+")):
        raise ValueError("company guard workflow change is not a consistent pin-only bump")
    return old, new


def _cert_old(workflow: dict, new: str) -> str:
    patch = workflow.get("patch")
    if not isinstance(patch, str):
        raise ValueError("public-app certification pin patch unavailable")
    changed = [line for line in patch.splitlines() if line.startswith(("+", "-"))]
    pins = {}
    for line in changed:
        uses, ref = _CERT_USES.fullmatch(line), _CERT_REF.fullmatch(line)
        if uses is None and ref is None:
            raise ValueError("public-app certification workflow change is not a consistent pin-only bump")
        key = (uses.group(1), "uses") if uses else (ref.group(1), "ref")
        if key in pins:
            raise ValueError("public-app certification Win requires both exact old and new pins")
        pins[key] = uses.group(2) if uses else ref.group(2)
    needed = {("-", "uses"), ("+", "uses"), ("-", "ref"), ("+", "ref")}
    if set(pins) != needed:
        raise ValueError("public-app certification Win requires both exact old and new pins")
    cert_old, cert_new = pins["-", "ref"], pins["+", "ref"]
    if (len(changed) != 4 or cert_old == cert_new or cert_new != new
            or pins["-", "uses"] != cert_old or pins["+", "uses"] != cert_new):
        raise ValueError("public-app certification workflow change is not a consistent pin-only bump")
    return cert_old


def pin_revisions(files) -> tuple[str, str, str | None]:
    """(old guard pin, new pin, old certification pin or None). Fails closed on any other diff."""
    if not isinstance(files, list):
        raise ValueError(ONE_PIN)
    guards, certs = [], []
    for file in files:
        if not isinstance(file, dict):
            raise ValueError(ONE_PIN)
        name, status = file.get("filename"), file.get("status")
        if name == GUARD:
            guards.append(file)
        elif name == CERT:
            certs.append(file)
        elif name in MACHINE_FILES and status in {"added", "modified"}:
            continue
        else:
            raise ValueError(ONE_PIN)
    if len(guards) != 1 or guards[0].get("status") != "modified":
        raise ValueError(ONE_PIN)
    if len(certs) > 1 or (certs and certs[0].get("status") != "modified"):
        raise ValueError(ONE_PIN)
    old, new = _guard_pins(guards[0])
    return old, new, _cert_old(certs[0], new) if certs else None


def github_action_revisions(files) -> tuple[str, str, str]:
    """Accept one root-action SHA replacement, optionally beside this repair machine."""
    message = "action Win requires one modified workflow with only a consistent action pin bump"
    if not isinstance(files, list) or any(not isinstance(file, dict) for file in files):
        raise ValueError(message)
    workflows = [file for file in files if not (
        file.get("filename") in MACHINE_FILES and file.get("status") in {"added", "modified"})]
    if (len(workflows) != 1 or workflows[0].get("status") != "modified"
            or not re.fullmatch(r"\.github/workflows/[\w.-]+\.ya?ml", workflows[0].get("filename") or "")
            or not isinstance(workflows[0].get("patch"), str)):
        raise ValueError(message)
    changed = [line for line in workflows[0]["patch"].splitlines() if line.startswith(("+", "-"))]
    pattern = re.compile(
        r"([+-])( +uses: )([A-Za-z0-9][A-Za-z0-9-]*/[A-Za-z0-9][A-Za-z0-9_.-]*)"
        r"@([0-9a-f]{40})(?: +#.*)?")
    pins = [pattern.fullmatch(line) for line in changed]
    if len(pins) != 2 or any(pin is None for pin in pins):
        raise ValueError(message)
    old, new = pins
    if (old[1] != "-" or new[1] != "+" or (old[2], old[3]) != (new[2], new[3]) or old[4] == new[4]):
        raise ValueError(message)
    return old[3], old[4], new[4]


def _metric(name: str, count: int, after: int, old: str, new: str, *, repository="JovieInc/ci") -> str:
    return (
        f"- Metric: {name} | commits | lower | {count} | {after} | "
        "GitHub compare API, old pin versus adopted target | "
        f"node packages/api-client/cli.ts gh --priority repair -- api repos/{repository}/compare/{old}...{new} --jq .ahead_by && "
        f"node packages/api-client/cli.ts gh --priority repair -- api repos/{repository}/compare/{new}...{new} --jq .ahead_by"
    )


def github_action_pin(files, comparison, *, adopted_comparison) -> str:
    """Prove upstream pin freshness, without inferring runtime or throughput gains."""
    repository, old, new = github_action_revisions(files)
    count = _forward_count(comparison, old, new, "action upstream comparison must match the forward pin bump",
                           repository=repository)
    after = _adopted_count(adopted_comparison, new, "action adopted target must prove zero remaining commits",
                           repository=repository)
    section = "\n".join([
        "## Win", "", f"- Claim: Bring the {repository} pin up to the verified upstream target; "
        "runtime or throughput improvement is not measured.",
        "- Area: ci", "- Theme: dependency-maintenance",
        _metric("upstream action commits behind target", count, after, old, new, repository=repository),
        f"- Verify: https://github.com/{repository}/compare/{old}...{new}", "",
    ])
    validate(section)
    return section


def company_guard_pin(files: list[dict], comparison: dict, *, adopted_comparison: dict,
                      certification_comparison: dict | None = None,
                      certification_adopted: dict | None = None) -> str:
    """Generate a measured Win for a pin-only workflow edit, never a speed claim.

    Pass fresh REST PR files and GitHub comparisons for OLD...NEW and NEW...NEW.
    A modified public-app certification workflow needs its own pair of comparisons.
    Feed the returned section to pr_events.repair_evidence_body(win_section=...).
    The caller owns the GitHub read and exact-head binding; this helper does no I/O
    except the existing canonical Win validation. Mismatched evidence fails closed.
    """
    old, new, cert_old = pin_revisions(files)
    if (certification_comparison is not None or certification_adopted is not None) and cert_old is None:
        raise ValueError("public-app certification comparison requires the certification workflow")
    count = _forward_count(
        comparison, old, new, "upstream comparison must completely match the workflow's forward pin bump")
    after = _adopted_count(
        adopted_comparison, new, "adopted target comparison must prove zero remaining commits at the new pin")
    metrics = [_metric("upstream guard commits behind target", count, after, old, new)]
    claim = GUARD_CLAIM
    if cert_old is not None:
        if certification_comparison is None or certification_adopted is None:
            raise ValueError("public-app certification pin requires its own upstream comparison")
        cert_count = _forward_count(
            certification_comparison, cert_old, new,
            "certification comparison must completely match the workflow's forward pin bump")
        cert_after = _adopted_count(
            certification_adopted, new,
            "adopted certification comparison must prove zero remaining commits at the new pin")
        metrics.append(_metric(
            "upstream certification commits behind target", cert_count, cert_after, cert_old, new))
        claim = BOTH_CLAIM
    section = "\n".join([
        "## Win", "", f"- Claim: {claim}", "- Area: ci", "- Theme: guard-freshness",
        *metrics, f"- Verify: https://github.com/JovieInc/ci/compare/{old}...{new}", "",
    ])
    validate(section)
    return section


def dependabot_patch_ignores(before: dict, after: dict, *, before_sha: str, after_sha: str) -> str:
    """Measure exact-name, unrestricted ignores for unchanged pnpm patches.

    Snapshots contain parsed package.json (manifest) and dependabot.yml (config).
    This proves configuration coverage, not updater runtime or elapsed savings.
    """
    if any(not isinstance(sha, str) or not re.fullmatch(r"[0-9a-f]{40}", sha)
           for sha in (before_sha, after_sha)):
        raise ValueError("Dependabot evidence requires exact Git revisions")
    patches = before.get("manifest", {}).get("pnpm", {}).get("patchedDependencies")
    if not isinstance(patches, dict) or not patches or patches != after.get(
            "manifest", {}).get("pnpm", {}).get("patchedDependencies"):
        raise ValueError("Dependabot evidence requires unchanged, nonempty patch mappings")
    names = set()
    for spec in patches:
        match = re.fullmatch(r"((?:@[^/@]+/)?[^/@]+)@\d+\.\d+\.\d+(?:[-+][\w.-]+)?", spec)
        if not match:
            raise ValueError("Dependabot evidence requires exact-version patch keys")
        names.add(match[1])

    def uncovered(snapshot):
        updates = snapshot.get("config", {}).get("updates", [])
        roots = [row for row in updates if row.get("package-ecosystem") == "npm"
                 and (row.get("directory") == "/" or "/" in row.get("directories", []))]
        if len(roots) != 1:
            raise ValueError("Dependabot evidence requires one root npm update policy")
        ignored = {row.get("dependency-name") for row in roots[0].get("ignore", [])
                   if not row.get("versions") and not row.get("update-types")}
        return names - ignored

    old, new = uncovered(before), uncovered(after)
    if new:
        raise ValueError("Dependabot ignores must fully cover patched packages: " + ", ".join(sorted(new)))
    if not old:
        raise ValueError("Dependabot evidence requires an observed improvement")
    section = "\n".join([
        "## Win", "",
        "- Claim: Exclude every exact-version pnpm-patched package from root Dependabot version bumps.",
        "- Area: ci", "- Theme: dependency-update-reliability",
        f"- Metric: patched packages without unrestricted root Dependabot ignores | packages | lower | "
        f"{len(old)} | {len(new)} | parsed Git configuration snapshots (not updater runtime) | "
        f"python3 scripts/lanes/repair_win.py dependabot-patches {before_sha} {after_sha}",
        f"- Verify: https://github.com/JovieInc/Jovie/compare/{before_sha}...{after_sha}", "",
    ])
    validate(section)
    return section


def _load_yaml(text: str):
    """Parse with the repo's js-yaml. Callers fail closed on any non-zero parser result."""
    done = subprocess.run(["node", "--input-type=module", "-e", """
import { readFileSync } from 'node:fs';
import { load } from 'js-yaml';
console.log(JSON.stringify(load(readFileSync(0, 'utf8'))));
"""], cwd=ROOT, input=text, text=True, capture_output=True, check=True, timeout=10)
    return json.loads(done.stdout)


def dependabot_snapshot(sha: str) -> dict:
    """Read immutable repository data; parse YAML with the installed repo parser."""
    if not re.fullmatch(r"[0-9a-f]{40}", sha):
        raise ValueError("snapshot requires an exact Git revision")
    def read(path):
        return subprocess.check_output(["git", "show", f"{sha}:{path}"], cwd=ROOT, text=True)
    return {"manifest": json.loads(read("package.json")), "config": _load_yaml(read(".github/dependabot.yml"))}


def pen_retry_win(before_sha: str, after_sha: str) -> str:
    """Measure one injected transient failure using the same test on both revisions.

    This is a controlled scenario, not a claim about live outage frequency or time saved.
    Refuse missing tests, unrelated failures, and non-ancestral or unchanged revisions.
    """
    if any(not re.fullmatch(r"[0-9a-f]{40}", sha) for sha in (before_sha, after_sha)):
        raise ValueError("retry evidence requires exact Git revisions")
    if before_sha == after_sha or subprocess.run(
            ["git", "merge-base", "--is-ancestor", before_sha, after_sha], cwd=ROOT).returncode:
        raise ValueError("retry evidence requires distinct ancestral revisions")
    source = "scripts/invariants/pen-golden-path.mjs"
    test = "scripts/invariants/pen-golden-path.test.mjs"
    name = "a transient browser-install failure is retried before the strict diff runs"

    def read(sha, path):
        return subprocess.check_output(["git", "show", f"{sha}:{path}"], cwd=ROOT, text=True)

    test_text = read(after_sha, test)
    with tempfile.TemporaryDirectory(prefix="pen-retry-win-") as tmp:
        directory = Path(tmp)
        atomic_write_text(directory / "pen-golden-path.test.mjs", test_text)
        results = []
        for sha in (before_sha, after_sha):
            atomic_write_text(directory / "pen-golden-path.mjs", read(sha, source))
            results.append(subprocess.run(
                ["node", "--test-reporter=tap", f"--test-name-pattern=^{name}$",
                 str(directory / "pen-golden-path.test.mjs")],
                cwd=ROOT, text=True, capture_output=True, timeout=30))
    old, new = results
    if (old.returncode != 1 or "# tests 1\n" not in old.stdout
            or "# fail 1\n" not in old.stdout or "apt-get failed: 503" not in old.stdout
            or new.returncode != 0 or "# tests 1\n" not in new.stdout
            or "# pass 1\n" not in new.stdout or "# fail 0\n" not in new.stdout):
        raise ValueError("retry scenario did not produce the expected red-before-green outcome")
    section = "\n".join([
        "## Win", "",
        "- Claim: Reach the strict Pen diff after injected transient browser-install failures in a controlled test.",
        "- Area: ci", "- Theme: probe-reliability",
        "- Metric: controlled transient-install scenarios reaching strict diff | scenarios | higher | 0 | 1 | "
        "same deterministic regression test against both Git revisions; not live outage frequency | "
        f"python3 scripts/lanes/repair_win.py pen-retry {before_sha} {after_sha}",
        f"- Verify: https://github.com/JovieInc/Jovie/compare/{before_sha}...{after_sha}", "",
    ])
    validate(section)
    return section


def workflow_gate_path(files) -> str:
    """The one workflow beside this repair machine. Any other path fails closed."""
    message = "measured win diff is not a pin bump"
    if not isinstance(files, list) or any(not isinstance(file, dict) for file in files):
        raise ValueError(message)
    workflows = [file for file in files if not (
        file.get("filename") in MACHINE_FILES and file.get("status") in {"added", "modified"})]
    name = workflows[0].get("filename") if len(workflows) == 1 else ""
    if (len(workflows) != 1 or workflows[0].get("status") != "modified"
            or not re.fullmatch(r"\.github/workflows/[\w.-]+\.ya?ml", name or "")):
        raise ValueError(message)
    return name


def _job_if(job) -> str:
    if not isinstance(job, dict) or job.get("if") is None:
        return ""
    if not isinstance(job.get("if"), str):
        raise ValueError("workflow job if must be a string")
    return " ".join(job["if"].split())


def _unwrap(expr: str) -> str:
    expr = expr.strip()
    while len(expr) >= 2 and expr[0] == "(" and expr[-1] == ")":
        depth = 0
        whole = True
        for index, char in enumerate(expr):
            depth += (char == "(") - (char == ")")
            if depth < 0 or (depth == 0 and index != len(expr) - 1):
                whole = False
                break
        if not whole or depth != 0:
            break
        expr = expr[1:-1].strip()
    return expr


def _without_job_if(doc):
    jobs = doc.get("jobs") if isinstance(doc, dict) else None
    if not isinstance(jobs, dict) or not jobs:
        raise ValueError("workflow job gate requires a jobs map")
    clone = json.loads(json.dumps(doc))
    for job in clone["jobs"].values():
        if isinstance(job, dict):
            job.pop("if", None)
    return clone


_NEW_GATE = re.compile(r"vars\.([A-Z][A-Z0-9_]*) == 'true'(?: && (.*))?\Z")


def workflow_job_gate(before_text: str, after_text: str, *, before_sha: str, after_sha: str, path: str) -> str:
    """Count jobs whose if does not require one newly added vars.NAME == 'true'.

    Parsed workflow YAML at two revisions. This is configuration coverage, not a
    live Actions variable read and not elapsed runner time.
    """
    if any(not isinstance(sha, str) or not re.fullmatch(r"[0-9a-f]{40}", sha) for sha in (before_sha, after_sha)):
        raise ValueError("workflow job gate requires exact Git revisions")
    if not isinstance(path, str) or not re.fullmatch(r"\.github/workflows/[\w.-]+\.ya?ml", path):
        raise ValueError("workflow job gate requires one workflow path")
    before, after = _load_yaml(before_text), _load_yaml(after_text)
    if _without_job_if(before) != _without_job_if(after):
        raise ValueError("workflow job gate accepts only job if changes")
    old_jobs, new_jobs = before["jobs"], after["jobs"]
    if set(old_jobs) != set(new_jobs):
        raise ValueError("workflow job gate accepts only job if changes")
    added = []
    for name in old_jobs:
        old_if, new_if = _job_if(old_jobs[name]), _job_if(new_jobs[name])
        if old_if == new_if:
            continue
        match = _NEW_GATE.fullmatch(new_if)
        if match is None:
            raise ValueError("workflow job gate requires a new vars.NAME == 'true' conjunction")
        added.append(match.group(1))
        if _unwrap(match.group(2) or "") != old_if:
            raise ValueError("workflow job gate must preserve the previous job if")
    if len(set(added)) != 1:
        raise ValueError("workflow job gate requires exactly one new variable")
    variable = added[0]
    token = f"vars.{variable} == 'true'"
    old_count = sum(token not in _job_if(job) for job in old_jobs.values())
    new_count = sum(token not in _job_if(job) for job in new_jobs.values())
    if new_count >= old_count:
        raise ValueError("workflow job gate requires fewer ungated jobs")
    section = "\n".join([
        "## Win", "",
        f"- Claim: Require {variable} before the previously ungated workflow jobs run.",
        "- Area: ci", "- Theme: workflow-killswitch",
        f"- Metric: {variable} ungated jobs | jobs | lower | {old_count} | {new_count} | "
        "parsed workflow YAML at the two revisions | "
        f"python3 scripts/lanes/repair_win.py workflow-job-gate {before_sha} {after_sha} {path}",
        f"- Verify: https://github.com/JovieInc/Jovie/compare/{before_sha}...{after_sha}", "",
    ])
    validate(section)
    return section


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("kind", choices=["dependabot-patches", "pen-retry", "workflow-job-gate"])
    parser.add_argument("before_sha")
    parser.add_argument("after_sha")
    parser.add_argument("path", nargs="?")
    args = parser.parse_args()
    if args.kind == "pen-retry":
        print(pen_retry_win(args.before_sha, args.after_sha), end="")
    elif args.kind == "workflow-job-gate":
        if not args.path:
            parser.error("workflow-job-gate requires a workflow path")
        def read(sha):
            return subprocess.check_output(["git", "show", f"{sha}:{args.path}"], cwd=ROOT, text=True)
        print(workflow_job_gate(read(args.before_sha), read(args.after_sha), before_sha=args.before_sha,
                                 after_sha=args.after_sha, path=args.path), end="")
    else:
        print(dependabot_patch_ignores(dependabot_snapshot(args.before_sha), dependabot_snapshot(args.after_sha),
                                      before_sha=args.before_sha, after_sha=args.after_sha), end="")
