#!/usr/bin/env python3
"""
tech-debt-scanner.py — Scan codebase for tech debt signals.

Outputs unified JSON registry of all debt items.
Deduplicates against existing TECH_DEBT_REGISTRY.md.

Usage:
    python3 tech-debt-scanner.py [--repo PATH] [--output PATH] [--update-registry]

Exit codes:
    0 — scan complete, no new debt
    1 — scan complete, new debt found
    2 — error
"""

import argparse
import json
import os
import re
import subprocess
import sys
from dataclasses import dataclass, asdict
from datetime import date, datetime
from pathlib import Path

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

REPO_ROOT = Path(os.environ.get("REPO_ROOT", "."))
REGISTRY_PATH = REPO_ROOT / "TECH_DEBT_REGISTRY.md"
OUTPUT_PATH = REPO_ROOT / ".tech-debt" / "scan-results.json"

# File extensions to scan
CODE_EXTENSIONS = {
    ".py", ".js", ".ts", ".tsx", ".jsx", ".swift", ".kt", ".java",
    ".rb", ".go", ".rs", ".c", ".cpp", ".h", ".hpp",
}
DOC_EXTENSIONS = {".md", ".rst", ".txt"}
SCAN_EXTENSIONS = CODE_EXTENSIONS | DOC_EXTENSIONS

# Directories to skip
SKIP_DIRS = {
    ".git", "node_modules", "vendor", "__pycache__", ".venv", "venv",
    "build", "dist", ".gradle", ".idea", ".vscode", "coverage",
    ".tech-debt", "tmp", "log", "logs",
}

# Debt markers in comments: (pattern, category, base_interest)
DEBT_MARKERS = [
    # (regex, category, interest, fix_strategy)
    (r"TODO[\s:]+(.+)", "code", 2, "manual"),
    (r"FIXME[\s:]+(.+)", "code", 3, "manual"),
    (r"HACK[\s:]+(.+)", "code", 3, "manual"),
    (r"XXX[\s:]+(.+)", "code", 3, "manual"),
    (r"DEBT[\s:]+(.+)", "code", 3, "manual"),
    (r"DEPRECATED[\s:]+(.+)", "deprecation", 3, "manual"),
    (r"WORKAROUND[\s:]+(.+)", "code", 3, "manual"),
    (r"KLUDGE[\s:]+(.+)", "code", 3, "manual"),
    (r"REFACTOR[\s:]+(.+)", "arch", 3, "pr"),
    (r"OPTIMIZE[\s:]+(.+)", "code", 2, "manual"),
    (r"BUG[\s:]+(.+)", "code", 4, "manual"),
    (r"SECURITY[\s:]+(.+)", "security", 5, "manual"),
    (r"NOCOMMIT|NOCOMMIT", "code", 4, "manual"),
    (r"print\(", "code", 1, "ruff"),  # debug prints in Python
]

# Test-related patterns
TEST_DEBT_PATERS = [
    (r"@pytest\.mark\.skip", "test", 2, "manual"),
    (r"@unittest\.skip", "test", 2, "manual"),
    (r"pass\s*#\s*test", "test", 2, "manual"),
    (r"#\s*TODO.*test", "test", 2, "manual"),
]

# ---------------------------------------------------------------------------
# Data model
# ---------------------------------------------------------------------------

@dataclass
class DebtItem:
    id: str = ""
    file: str = ""
    line: int = 0
    category: str = "code"
    interest: int = 1
    status: str = "open"
    auto_fixable: bool = False
    fix_strategy: str = "manual"
    discovered: str = ""
    last_seen: str = ""
    fixed_date: str = ""
    effort_hours: float = 0.5
    pr: str = ""
    description: str = ""
    snippet: str = ""

    @property
    def dedup_key(self) -> str:
        return f"{self.file}:{self.line}:{self.category}:{self.description}"


# ---------------------------------------------------------------------------
# Scanner
# ---------------------------------------------------------------------------

def find_files(root: Path) -> list[Path]:
    """Yield all scannable files under root."""
    result = []
    for dirpath, dirnames, filenames in os.walk(root):
        # Prune skip directories
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for fn in filenames:
            ext = Path(fn).suffix.lower()
            if ext in SCAN_EXTENSIONS:
                result.append(Path(dirpath) / fn)
    return result


def scan_file(filepath: Path, root: Path) -> list[DebtItem]:
    """Scan a single file for debt markers."""
    items = []
    rel_path = str(filepath.relative_to(root))
    today = date.today().isoformat()

    try:
        text = filepath.read_text(errors="replace")
    except OSError:
        return items

    lines = text.splitlines()
    is_test_file = (
        "/test" in rel_path or "/Test" in rel_path
        or rel_path.startswith("test") or "/__tests__/" in rel_path
    )

    for line_num, line in enumerate(lines, 1):
        # Skip very long lines (likely minified)
        if len(line) > 500:
            continue

        # Check debt markers
        markers = DEBT_MARKERS.copy()
        if is_test_file:
            markers += TEST_DEBT_PATERS

        for pattern, category, interest, fix_strategy in markers:
            match = re.search(pattern, line, re.IGNORECASE)
            if match:
                description = match.group(1).strip() if match.lastindex else match.group(0).strip()
                # Skip if it's just a reference to the registry itself
                if "TECH_DEBT_REGISTRY" in description:
                    continue

                snippet = line.strip()[:120]
                auto_fixable = fix_strategy == "ruff"

                item = DebtItem(
                    file=rel_path,
                    line=line_num,
                    category=category,
                    interest=interest,
                    status="open",
                    auto_fixable=auto_fixable,
                    fix_strategy=fix_strategy,
                    discovered=today,
                    last_seen=today,
                    description=description,
                    snippet=snippet,
                )
                items.append(item)

    return items


def run_ruff_check(repo: Path) -> list[DebtItem]:
    """Run ruff check and parse output for auto-fixable issues."""
    items = []
    today = date.today().isoformat()

    try:
        result = subprocess.run(
            ["ruff", "check", "--output-format=json", str(repo)],
            capture_output=True, text=True, timeout=60,
        )
        if result.returncode not in (0, 1):
            return items
        issues = json.loads(result.stdout) if result.stdout.strip() else []
    except (subprocess.TimeoutExpired, FileNotFoundError, json.JSONDecodeError):
        return items

    for issue in issues:
        filepath = issue.get("location", {}).get("file", "")
        if not filepath:
            continue
        # Make path relative
        try:
            rel_path = str(Path(filepath).relative_to(repo))
        except ValueError:
            rel_path = filepath

        line = issue.get("location", {}).get("row", 0)
        code = issue.get("code", "UNKNOWN")
        message = issue.get("message", "")
        fix = issue.get("fix", None)

        # Map ruff codes to interest
        interest_map = {
            "E": 2,  # pycodestyle errors
            "W": 1,  # pycodestyle warnings
            "F": 2,  # pyflakes
            "I": 1,  # isort
            "N": 1,  # pep8-naming
            "UP": 2,  # pyupgrade
            "B": 3,  # flake8-bugbear
            "SIM": 2,  # flake8-simplify
            "RUF": 2,  # ruff-specific
        }
        prefix = re.match(r"([A-Z]+)", code)
        interest = interest_map.get(prefix.group(1) if prefix else "", 1)

        item = DebtItem(
            file=rel_path,
            line=line,
            category="code",
            interest=interest,
            status="open",
            auto_fixable=fix is not None,
            fix_strategy="ruff" if fix else "manual",
            discovered=today,
            last_seen=today,
            description=f"[{code}] {message}",
            snippet=f"{code}: {message}"[:120],
        )
        items.append(item)

    return items


# ---------------------------------------------------------------------------
# Registry management
# ---------------------------------------------------------------------------

def load_existing_ids(registry_path: Path) -> dict[str, dict]:
    """Parse existing TECH_DEBT_REGISTRY.md for dedup."""
    existing = {}
    if not registry_path.exists():
        return existing

    text = registry_path.read_text()
    # Simple parser: look for file/line/category/description patterns
    # Format: ### DEBT-XXX or in YAML blocks
    for match in re.finditer(
        r"file:\s*(.+?)\n\s*line:\s*(\d+).*?category:\s*(.+?)\n.*?description:\s*(.+?)(?:\n|$)",
        text, re.DOTALL,
    ):
        f, l, c, d = match.groups()
        key = f"{f.strip()}:{l.strip()}:{c.strip()}:{d.strip()[:80]}"
        existing[key] = {"file": f.strip(), "line": int(l.strip())}

    return existing


def generate_id(index: int) -> str:
    today = date.today()
    return f"DEBT-{today.strftime('%Y%m%d')}-{index:03d}"


def dedup_items(items: list[DebtItem], existing: dict) -> list[DebtItem]:
    """Remove items that already exist in registry."""
    result = []
    for item in items:
        key = item.dedup_key
        if key not in existing:
            result.append(item)
    return result


# ---------------------------------------------------------------------------
# Output
# ---------------------------------------------------------------------------

def write_json_output(items: list[DebtItem], path: Path):
    path.parent.mkdir(parents=True, exist_ok=True)
    data = {
        "scan_date": datetime.now().isoformat(),
        "total_items": len(items),
        "by_category": {},
        "by_interest": {},
        "items": [asdict(i) for i in items],
    }
    for item in items:
        data["by_category"][item.category] = data["by_category"].get(item.category, 0) + 1
        data["by_interest"][str(item.interest)] = data["by_interest"].get(str(item.interest), 0) + 1

    path.write_text(json.dumps(data, indent=2))


def update_registry(items: list[DebtItem], registry_path: Path):
    """Append new items to TECH_DEBT_REGISTRY.md."""
    if not items:
        return

    today = date.today().isoformat()
    section = f"\n<!-- Scan {today} — {len(items)} new items -->\n\n"

    # Assign IDs
    for idx, item in enumerate(items, 1):
        item.id = generate_id(idx)
        item.discovered = today
        item.last_seen = today

    # Build markdown entries
    entries = []
    for item in items:
        status_emoji = "🔴" if item.interest >= 4 else "🟡" if item.interest >= 2 else "🟢"
        auto = "🤖" if item.auto_fixable else "👤"
        entries.append(
            f"### {item.id} {status_emoji} {auto}\n"
            f"- **file**: `{item.file}:{item.line}`\n"
            f"- **category**: {item.category}\n"
            f"- **interest**: {'⭐' * item.interest}\n"
            f"- **status**: {item.status}\n"
            f"- **auto_fixable**: {item.auto_fixable}\n"
            f"- **fix_strategy**: {item.fix_strategy}\n"
            f"- **discovered**: {item.discovered}\n"
            f"- **last_seen**: {item.last_seen}\n"
            f"- **description**: {item.description}\n"
            f"- **snippet**: `{item.snippet}`\n"
        )

    section += "\n".join(entries) + "\n"

    # Insert before the closing comment or append
    if registry_path.exists():
        content = registry_path.read_text()
        marker = "<!-- SCAN_INSERT"
        if marker in content:
            content = content.replace(marker, section + marker)
        else:
            content += section
        registry_path.write_text(content)
    else:
        registry_path.write_text("# TECH_DEBT_REGISTRY\n" + section)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Scan codebase for tech debt")
    parser.add_argument("--repo", default=str(REPO_ROOT), help="Repo root path")
    parser.add_argument("--output", default=str(OUTPUT_PATH), help="JSON output path")
    parser.add_argument("--update-registry", action="store_true", help="Update TECH_DEBT_REGISTRY.md")
    parser.add_argument("--json-only", action="store_true", help="Only output JSON, no registry update")
    args = parser.parse_args()

    repo = Path(args.repo).resolve()
    if not repo.is_dir():
        print(f"ERROR: {repo} is not a directory", file=sys.stderr)
        sys.exit(2)

    print(f"🔍 Scanning {repo} for tech debt...")

    # Scan files
    files = find_files(repo)
    print(f"   Found {len(files)} scannable files")

    all_items: list[DebtItem] = []
    for f in files:
        all_items.extend(scan_file(f, repo))

    print(f"   Found {len(all_items)} debt markers in source")

    # Run ruff
    ruff_items = run_ruff_check(repo)
    print(f"   Found {len(ruff_items)} ruff issues")
    all_items.extend(ruff_items)

    # Dedup
    existing = load_existing_ids(REGISTRY_PATH)
    new_items = dedup_items(all_items, existing)
    print(f"   {len(new_items)} new items (after dedup)")

    # Output
    output_path = Path(args.output)
    write_json_output(new_items, output_path)
    print(f"   Results written to {output_path}")

    if args.update_registry and not args.json_only:
        update_registry(new_items, REGISTRY_PATH)
        print(f"   Registry updated: {REGISTRY_PATH}")

    # Summary
    if new_items:
        by_cat = {}
        for i in new_items:
            by_cat[i.category] = by_cat.get(i.category, 0) + 1
        print(f"\n📊 New debt by category: {by_cat}")
        high = [i for i in new_items if i.interest >= 4]
        if high:
            print(f"⚠️  {len(high)} HIGH-INTEREST items need attention!")
        auto = [i for i in new_items if i.auto_fixable]
        print(f"🤖 {len(auto)} auto-fixable items")
        sys.exit(1)
    else:
        print("✅ No new debt found!")
        sys.exit(0)


if __name__ == "__main__":
    main()
