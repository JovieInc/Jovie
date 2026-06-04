#!/usr/bin/env python3
"""
tech-debt-paydown.py — Pay down tech debt in small increments.

Reads scan results, prioritizes by interest rate × recency,
auto-fixes what's safe, creates PR for medium items,
flags high-risk items for human review.

Usage:
    python3 tech-debt-paydown.py [--repo PATH] [--scan-results PATH] [--dry-run] [--max-auto INT]

Exit codes:
    0 — nothing to do or all done
    1 — changes made (PR created)
    2 — error
"""

import argparse
import json
import os
import re
import subprocess
import sys
from datetime import date
from pathlib import Path
from typing import Optional

REPO_ROOT = Path(os.environ.get("REPO_ROOT", "."))
SCAN_RESULTS = REPO_ROOT / ".tech-debt" / "scan-results.json"
REGISTRY_PATH = REPO_ROOT / "TECH_DEBT_REGISTRY.md"
MAX_AUTO_FIX_DEFAULT = 20  # max auto-fixes per run (small increments)


def load_scan_results(path: Path) -> list[dict]:
    if not path.exists():
        print("No scan results found. Run tech-debt-scanner.py first.")
        return []
    data = json.loads(path.read_text())
    return data.get("items", [])


def sort_by_priority(items: list[dict]) -> list[dict]:
    """Sort by interest DESC, then discovered ASC (oldest first = highest interest accumulation)."""
    return sorted(items, key=lambda x: (-x.get("interest", 1), x.get("discovered", "")))


def apply_ruff_fixes(repo: Path, dry_run: bool) -> int:
    """Run ruff check --fix. Returns number of files modified."""
    if dry_run:
        print("   [DRY RUN] Would run: ruff check --fix")
        return 0

    try:
        result = subprocess.run(
            ["ruff", "check", "--fix", "--unsafe-fixes", str(repo)],
            capture_output=True, text=True, timeout=120,
            cwd=str(repo),
        )
        # Count fixed issues from output
        fixed = result.stdout.count("Fixed") if result.stdout else 0
        print(f"   ruff --fix: {result.returncode}, ~{fixed} fixes applied")
        return fixed
    except (subprocess.TimeoutExpired, FileNotFoundError) as e:
        print(f"   ruff error: {e}")
        return 0


def apply_auto_fixes(items: list[dict], repo: Path, max_fixes: int, dry_run: bool) -> list[dict]:
    """Apply automated fixes to fixable items. Returns list of fixed items."""
    fixable = [i for i in items if i.get("auto_fixable") and i.get("fix_strategy") == "ruff"]
    to_fix = fixable[:max_fixes]

    if not to_fix:
        return []

    print(f"\n🤖 Auto-fixing {len(to_fix)} items (strategy=ruff)...")

    # For ruff-fixable items, run ruff --fix on the whole repo
    # More targeted: run on specific files
    files_to_fix = set()
    for item in to_fix:
        fpath = repo / item["file"]
        if fpath.exists():
            files_to_fix.add(str(fpath))

    fixed_items = []
    if files_to_fix and not dry_run:
        try:
            result = subprocess.run(
                ["ruff", "check", "--fix", "--unsafe-fixes", *files_to_fix],
                capture_output=True, text=True, timeout=120,
                cwd=str(repo),
            )
            if result.returncode in (0, 1):
                fixed_items = to_fix
                print(f"   Fixed {len(fixed_items)} items across {len(files_to_fix)} files")
        except (subprocess.TimeoutExpired, FileNotFoundError) as e:
            print(f"   Auto-fix error: {e}")
    elif dry_run:
        print(f"   [DRY RUN] Would fix {len(to_fix)} items in {len(files_to_fix)} files")
        fixed_items = to_fix  # Pretend for dry-run reporting

    return fixed_items


def group_debt_sprints(items: list[dict], max_per_sprint: int = 8) -> list[list[dict]]:
    """Group non-auto-fixable items into debt sprints."""
    non_auto = [i for i in items if not i.get("auto_fixable") and i.get("status") == "open"]
    non_auto = sort_by_priority(non_auto)

    sprints = []
    for i in range(0, len(non_auto), max_per_sprint):
        sprints.append(non_auto[i:i + max_per_sprint])
    return sprints


def create_debt_branch(repo: Path, items: list[dict], dry_run: bool) -> Optional[str]:
    """Create a git branch with auto-fixes. Returns branch name."""
    today = date.today().strftime("%Y%m%d")
    branch_name = f"debt/paydown-{today}"

    if dry_run:
        print(f"   [DRY RUN] Would create branch: {branch_name}")
        return branch_name

    try:
        # Create branch
        subprocess.run(["git", "checkout", "-b", branch_name], cwd=str(repo),
                        capture_output=True, text=True, timeout=30)

        # Stage changes
        subprocess.run(["git", "add", "-A"], cwd=str(repo),
                        capture_output=True, text=True, timeout=30)

        # Commit
        item_ids = [i.get("id", "unknown") for i in items[:5]]
        ids_str = ", ".join(item_ids)
        msg = f"debt: paydown {len(items)} items ({ids_str}"
        if len(items) > 5:
            msg += f" +{len(items)-5} more"
        msg += ")"

        subprocess.run(["git", "commit", "-m", msg], cwd=str(repo),
                        capture_output=True, text=True, timeout=30)

        # Push
        subprocess.run(["git", "push", "-u", "origin", branch_name], cwd=str(repo),
                        capture_output=True, text=True, timeout=30)

        print(f"   Created branch: {branch_name}")
        return branch_name
    except subprocess.TimeoutExpired:
        print("   Git operation timed out")
        return None


def create_pr(repo: Path, branch: str, items: list[dict], dry_run: bool) -> Optional[str]:
    """Create a GitHub PR for the debt paydown."""
    if dry_run:
        print(f"   [DRY RUN] Would create PR for {branch}")
        return "https://github.com/JovieInc/Jovie/pull/DRY-RUN"

    try:
        high_items = [i for i in items if i.get("interest", 0) >= 4]
        title = f"debt: paydown {len(items)} items"
        if high_items:
            title += f" ({len(high_items)} high-interest)"

        body_lines = [
            f"## Tech Debt Paydown {date.today().isoformat()}",
            "",
            f"**Items fixed:** {len(items)}",
            f"**High-interest items:** {len(high_items)}",
            "",
            "### Fixed Items",
        ]
        for item in items[:20]:
            interest_stars = "⭐" * item.get("interest", 1)
            body_lines.append(
                f"- `{item['file']}:{item['line']}` — {item['description'][:80]} {interest_stars}"
            )
        if len(items) > 20:
            body_lines.append(f"- ... and {len(items) - 20} more")

        body = "\n".join(body_lines)

        result = subprocess.run(
            ["gh", "pr", "create",
             "--title", title,
             "--body", body,
             "--base", "main",
             "--head", branch,
             "--label", "tech-debt"],
            cwd=str(repo), capture_output=True, text=True, timeout=3200,
        )
        if result.returncode == 0:
            pr_url = result.stdout.strip().split("\n")[-1]
            print(f"   PR created: {pr_url}")
            return pr_url
        else:
            print(f"   PR creation failed: {result.stderr[:200]}")
            return None
    except (subprocess.TimeoutExpired, FileNotFoundError) as e:
        print(f"   gh error: {e}")
        return None


def update_registry_status(items: list[dict], pr_url: str, registry_path: Path, dry_run: bool):
    """Mark fixed items as 'fixed' in the registry."""
    if dry_run or not items:
        return

    today = date.today().isoformat()
    if not registry_path.exists():
        return

    content = registry_path.read_text()
    for item in items:
        item_id = item.get("id", "")
        if item_id:
            # Update status from 'open' to 'fixed'
            pattern = rf"(### {item_id}.*?status:\s*)open"
            content = re.sub(pattern, r"\1fixed", content, flags=re.DOTALL)
            # Add fixed_date
            if "fixed_date:" not in content[content.find(item_id):content.find(item_id) + 500]:
                content = content.replace(
                    f"### {item_id}",
                    f"### {item_id}\n- **fixed_date**: {today}\n- **pr**: {pr_url}",
                    1,
                )

    registry_path.write_text(content)


def generate_report(items: list[dict], fixed: list[dict], sprints: list[list[dict]], pr_url: Optional[str]) -> str:
    """Generate a human-readable paydown report."""
    lines = [
        f"# Tech Debt Paydown Report — {date.today().isoformat()}",
        "",
        f"**Total open items:** {len(items)}",
        f"**Auto-fixed:** {len(fixed)}",
        f"**Remaining sprints:** {len(sprints)}",
    ]

    if pr_url:
        lines.append(f"**PR:** {pr_url}")

    if sprints:
        lines.append("")
        lines.append("## Next Debt Sprints (for human review)")
        for idx, sprint in enumerate(sprints[:3], 1):
            total_effort = sum(i.get("effort_hours", 0.5) for i in sprint)
            lines.append(f"\n### Sprint {idx} — {len(sprint)} items (~{total_effort:.1f}h)")
            for item in sprint:
                interest = "⭐" * item.get("interest", 1)
                lines.append(f"- `{item['file']}:{item['line']}` — {item['description'][:60]} {interest}")

        if len(sprints) > 3:
            lines.append(f"\n... and {len(sprints) - 3} more sprints")

    # High-interest items that weren't auto-fixed
    high_remaining = [i for i in items if i.get("interest", 0) >= 4
                      and i.get("status") == "open"
                      and i not in fixed]
    if high_remaining:
        lines.append("")
        lines.append("## ⚠️ High-Interest Items Needing Manual Attention")
        for item in high_remaining[:10]:
            interest = "⭐" * item.get("interest", 1)
            lines.append(f"- `{item['file']}:{item['line']}` — {item['description'][:80]} {interest}")

    lines.append("")
    report = "\n".join(lines)

    # Write report
    report_path = REPO_ROOT / ".tech-debt" / f"paydown-report-{date.today().isoformat()}.md"
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(report)
    return report


def main():
    parser = argparse.ArgumentParser(description="Pay down tech debt in small increments")
    parser.add_argument("--repo", default=str(REPO_ROOT), help="Repo root path")
    parser.add_argument("--scan-results", default=str(SCAN_RESULTS), help="Path to scan results JSON")
    parser.add_argument("--max-auto", type=int, default=MAX_AUTO_FIX_DEFAULT, help="Max auto-fixes per run")
    parser.add_argument("--dry-run", action="store_true", help="Don't make changes")
    parser.add_argument("--scan", action="store_true", help="Run scanner first")
    args = parser.parse_args()

    repo = Path(args.repo).resolve()
    print(f"💰 Tech Debt Paydown — {date.today().isoformat()}")
    print(f"   Repo: {repo}")

    # Optionally run scanner first
    if args.scan:
        scanner = repo / "scripts" / "tech-debt-scanner.py"
        if scanner.exists():
            print("\n🔍 Running scanner first...")
            subprocess.run([sys.executable, str(scanner), "--repo", str(repo),
                            "--output", str(Path(args.scan_results)), "--update-registry"],
                           cwd=str(repo), timeout=120)

    # Load scan results
    items = load_scan_results(Path(args.scan_results))
    if not items:
        print("✅ No debt items to process!")
        sys.exit(0)

    items = sort_by_priority(items)
    print(f"   {len(items)} items to process")

    # Phase 1: Auto-fix
    fixed = apply_auto_fixes(items, repo, args.max_auto, args.dry_run)
    if fixed:
        apply_ruff_fixes(repo, args.dry_run)

    # Phase 2: Group remaining into sprints
    remaining = [i for i in items if i not in fixed]
    sprints = group_debt_sprints(remaining)

    # Phase 3: Create PR for auto-fixes
    pr_url = None
    if fixed and not args.dry_run:
        print(f"\n📤 Creating PR for {len(fixed)} auto-fixes...")
        branch = create_debt_branch(repo, fixed, args.dry_run)
        if branch:
            pr_url = create_pr(repo, branch, fixed, args.dry_run)
            if pr_url:
                update_registry_status(fixed, pr_url, REGISTRY_PATH, args.dry_run)
    elif fixed and args.dry_run:
        print(f"\n[DRY RUN] Would create PR for {len(fixed)} auto-fixes")

    # Phase 4: Report
    report = generate_report(items, fixed, sprints, pr_url)
    print(f"\n{report}")

    if fixed:
        sys.exit(1)
    sys.exit(0)


if __name__ == "__main__":
    main()
