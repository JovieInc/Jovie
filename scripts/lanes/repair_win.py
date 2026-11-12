"""Canonical measured-Win validation for the existing PR repair loop."""
import json
from pathlib import Path
import re
import subprocess


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


def company_guard_pin(files: list[dict], comparison: dict, *, adopted_comparison: dict) -> str:
    """Generate a measured Win for a pin-only workflow edit, never a speed claim.

    Pass fresh REST PR files and GitHub comparisons for OLD...NEW and NEW...NEW.
    Feed the returned section to pr_events.repair_evidence_body(win_section=...).
    The caller owns the GitHub read and exact-head binding; this helper does no I/O
    except the existing canonical Win validation. Mismatched evidence fails closed.
    """
    workflows = [file for file in files if file.get("filename") == ".github/workflows/company-guards.yml"]
    if len(workflows) != 1 or workflows[0].get("status") != "modified":
        raise ValueError("company guard Win requires one modified workflow pin")
    patch = workflows[0].get("patch")
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
    url = f"https://github.com/JovieInc/ci/compare/{old}...{new}"
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
        raise ValueError("upstream comparison must completely match the workflow's forward pin bump")
    if (not isinstance(adopted_comparison, dict)
            or adopted_comparison.get("html_url") != f"https://github.com/JovieInc/ci/compare/{new}...{new}"
            or adopted_comparison.get("status") != "identical"
            or any(type(adopted_comparison.get(key)) is not int or adopted_comparison[key] != 0
                   for key in ("ahead_by", "behind_by", "total_commits"))
            or adopted_comparison.get("commits") != []
            or any(not isinstance(adopted_comparison.get(key), dict)
                   or adopted_comparison[key].get("sha") != new
                   for key in ("base_commit", "merge_base_commit"))):
        raise ValueError("adopted target comparison must prove zero remaining commits at the new pin")
    after = adopted_comparison["ahead_by"]
    section = "\n".join([
        "## Win", "",
        "- Claim: Bring the shared company guard pin up to the verified upstream target.",
        "- Area: ci", "- Theme: guard-freshness",
        f"- Metric: upstream guard commits behind target | commits | lower | {count} | {after} | "
        f"GitHub compare API, old pin versus adopted target | "
        f"node packages/api-client/cli.ts gh --priority repair -- api repos/JovieInc/ci/compare/{old}...{new} --jq .ahead_by && "
        f"node packages/api-client/cli.ts gh --priority repair -- api repos/JovieInc/ci/compare/{new}...{new} --jq .ahead_by",
        f"- Verify: {url}", "",
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


def dependabot_snapshot(sha: str) -> dict:
    """Read immutable repository data; parse YAML with the installed repo parser."""
    if not re.fullmatch(r"[0-9a-f]{40}", sha):
        raise ValueError("snapshot requires an exact Git revision")
    def read(path):
        return subprocess.check_output(["git", "show", f"{sha}:{path}"], cwd=ROOT, text=True)
    yaml = subprocess.run(["node", "--input-type=module", "-e", """
import { readFileSync } from 'node:fs';
import { load } from 'js-yaml';
console.log(JSON.stringify(load(readFileSync(0, 'utf8'))));
"""], cwd=ROOT, input=read(".github/dependabot.yml"), text=True, capture_output=True, check=True, timeout=10)
    return {"manifest": json.loads(read("package.json")), "config": json.loads(yaml.stdout)}


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("kind", choices=["dependabot-patches"])
    parser.add_argument("before_sha")
    parser.add_argument("after_sha")
    args = parser.parse_args()
    print(dependabot_patch_ignores(dependabot_snapshot(args.before_sha), dependabot_snapshot(args.after_sha),
                                  before_sha=args.before_sha, after_sha=args.after_sha), end="")
