"""Complete a partial measured-Win envelope from evidence already in the section.

Fleet Rules rejects a present ## Win that lacks Claim, Area, Theme, or Verify.
Those four fields are filled only from the metric line and CI-only paths.
Any other defect stays with the model. Numbers are never invented.
"""
from __future__ import annotations

import re
from pathlib import Path

ACTION = "repair-win-envelope"
_LEDGER = Path(__file__).resolve().parents[2] / "scripts/lib/wins-ledger.mjs"
_AREAS = frozenset({"ci", "queue", "release", "summer", "perf", "design", "repo", "quality", "ai"})
_WIN_HEADING = re.compile(r"^#{2,3}\s*Win\s*$", re.I)
_WIN_ERROR = re.compile(r"(?:##\[error\])?win:\s*(.+)")
_ENVELOPE_PREFIXES = (
    "area must be one of ",
    "claim must be one line, at most 200 characters",
    "theme is required",
    "verifyLink required",
)
_FIELD = re.compile(r"^\s*-?\s*(Claim|Area|Theme|Verify|Pending|Per-merge):\s*(.*)$", re.I)
_METRIC = re.compile(r"^\s*-?\s*Metric:\s*(.+)$", re.I)
_DECLINED = re.compile(r"^(?:-\s*)?(?:n/?a|none|not applicable)\b", re.I)
_URL = re.compile(r"https://\S+")


def _text(value) -> bool:
    return isinstance(value, str) and len(value.strip()) > 2


def win_messages(text: str) -> list[str]:
    return [match.group(1).strip() for match in _WIN_ERROR.finditer(text or "")]


def envelope_only(text: str) -> bool:
    """True when every win error is one of the four envelope fields."""
    messages = win_messages(text)
    return bool(messages) and all(
        any(message.startswith(prefix) for prefix in _ENVELOPE_PREFIXES) for message in messages)


def route(text: str) -> tuple[str, str]:
    """Envelope-only logs are deterministic. Every other win stays with the model."""
    if envelope_only(text):
        return "win-envelope", ACTION
    return "fleet-body", "agent"


def _paths(files) -> list[str] | None:
    if not isinstance(files, list) or not files:
        return None
    paths = []
    for item in files:
        if isinstance(item, str):
            path = item
        elif isinstance(item, dict) and isinstance(item.get("filename"), str):
            path = item["filename"]
        else:
            return None
        if not path:
            return None
        paths.append(path)
    return paths


def infer_area(files) -> str | None:
    """`ci` when every path is workflow or script. Anything else fails closed."""
    paths = _paths(files)
    if not paths:
        return None
    if all(path.startswith(".github/") or path.startswith("scripts/") for path in paths):
        return "ci"
    return None


def _slug(name: str) -> str:
    return "-".join(re.findall(r"[a-z0-9]+", name.lower()))[:80].strip("-")


def _verify(metric: str) -> str:
    parts = [part.strip() for part in metric.split("|")]
    source = parts[5] if len(parts) > 5 else ""
    query = "|".join(parts[6:]).strip() if len(parts) > 6 else ""
    urls = _URL.findall(f"{source} {query}")
    if urls:
        return urls[0].rstrip(").,")
    return " — ".join(part for part in (source, query) if _text(part))


def _section_text(body: str) -> str | None:
    from pr_body_markup import red_section_bounds

    lines = (body or "").split("\n")
    bounds = red_section_bounds(lines, _WIN_HEADING)
    if bounds is None:
        return None
    start, end = bounds
    return "\n".join(lines[start:end]).rstrip("\n")


def complete_section(body: str, files) -> tuple[str, str] | None:
    """(replacement section, previous section) or None. Does not invent a metric."""
    previous = _section_text(body)
    if not previous:
        return None
    block = previous.split("\n", 1)[1] if "\n" in previous else ""
    if _DECLINED.match(block.strip()):
        return None
    fields: dict[str, str] = {}
    metrics: list[str] = []
    for line in block.split("\n"):
        if not line.strip():
            continue
        metric = _METRIC.match(line)
        field = _FIELD.match(line)
        if metric:
            metrics.append(metric.group(1).strip())
        elif field:
            fields[field.group(1).lower()] = field.group(2).strip()
        else:
            return None
    if not metrics:
        return None
    name = metrics[0].split("|", 1)[0].strip()
    claim = fields.get("claim", "")
    if not _text(claim) or len(claim) > 200:
        if not _text(name) or len(name) > 200:
            return None
        claim = name
    area = fields.get("area", "")
    if area.lower() in _AREAS:
        area = area.lower()
    else:
        area = infer_area(files) or ""
        if area not in _AREAS:
            return None
    theme = fields.get("theme", "")
    if not _text(theme):
        theme = _slug(name)
        if not _text(theme):
            return None
    verify = fields.get("verify", "")
    if not _text(verify):
        verify = _verify(metrics[0])
        if not _text(verify):
            return None
    lines = ["## Win", "", f"- Claim: {claim}", f"- Area: {area}", f"- Theme: {theme}"]
    lines.extend(f"- Metric: {metric}" for metric in metrics)
    lines.append(f"- Verify: {verify}")
    if _text(fields.get("per-merge", "")):
        lines.append(f"- Per-merge: {fields['per-merge']}")
    if _text(fields.get("pending", "")) or fields.get("pending", "").lower() in {"yes", "true", "pending"}:
        lines.append(f"- Pending: {fields['pending']}")
    section = "\n".join(lines) + "\n"
    # The release self-test ships scripts/lanes without the Win ledger. The full
    # checkout still refuses a section Fleet Rules would reject.
    if _LEDGER.exists():
        try:
            import repair_win
            repair_win.validate(section)
        except (OSError, ValueError):
            return None
    return section, previous


def _shell(sh):
    if sh is not None:
        return sh
    import pr_events
    return pr_events.api_gh


def optional_completion(pr, sh=None, files=None):
    """Win replacement for a mixed repair. None keeps the other stamps running."""
    try:
        shell = _shell(sh)
        import pr_events
        if files is None:
            import fix_red_measured_win
            files = fix_red_measured_win.read_files(pr, shell)
        viewed = shell(["pr", "view", str(pr["number"]), "--repo", pr_events.REPO, "--json", "body", "--jq", ".body"])
        if getattr(viewed, "returncode", 1) != 0:
            return None
        return complete_section(viewed.stdout or "", files)
    except (OSError, ValueError, TypeError, KeyError, AttributeError):
        return None


def publish(pr, sh=None, *, files=None, customer_decision=None, premise=None, blast_radius=None) -> bool:
    """Replace the partial Win through the existing evidence writer. False on any miss."""
    shell = _shell(sh)
    number = pr.get("number") if isinstance(pr, dict) else None
    if type(number) is not int or number < 1:
        return False
    import pr_events
    viewed = shell(["pr", "view", str(number), "--repo", pr_events.REPO, "--json", "body", "--jq", ".body"])
    if getattr(viewed, "returncode", 1) != 0:
        return False
    body = viewed.stdout or ""
    if files is None:
        try:
            import fix_red_measured_win
            files = fix_red_measured_win.read_files(pr, shell)
        except (OSError, ValueError, TypeError, KeyError, AttributeError):
            return False
    completed = complete_section(body, files)
    if completed is None:
        return False
    section, previous = completed
    try:
        updated = pr_events.repair_evidence_body(
            pr, body, "", customer_decision=customer_decision, win_section=section,
            previous_win_section=previous, premise=premise, blast_radius=blast_radius)
    except (OSError, ValueError, TypeError):
        return False
    if updated == body:
        return False
    from tempfile import TemporaryDirectory
    from atomic_state import atomic_write_text
    with TemporaryDirectory(prefix="win-envelope-") as tmp:
        path = Path(tmp) / "body.md"
        atomic_write_text(path, updated)
        if path.read_text() != updated:
            return False
        edited = shell(["pr", "edit", str(number), "--repo", pr_events.REPO, "--body-file", str(path)])
    return getattr(edited, "returncode", 1) == 0


def apply(host, pr, claim_route, sh=None) -> str | None:
    """Claim once after the envelope can be completed. None leaves the head on the model."""
    shell = _shell(sh)
    try:
        import fix_red_measured_win
        files = fix_red_measured_win.read_files(pr, shell)
    except (OSError, ValueError, TypeError, KeyError, AttributeError):
        return None
    if optional_completion(pr, shell, files) is None:
        return None
    if not claim_route(host, pr, ACTION):
        return None
    edited = publish(pr, shell, files=files, customer_decision={"releaseWorthy": False})
    return "infra-rerun:win-envelope" if edited else None
