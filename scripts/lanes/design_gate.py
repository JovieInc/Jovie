#!/usr/bin/env python3
"""Design gate for Symphony build lanes (JOV-7541).

UI and landing work is admitted to a build lane only after a design brief
completes steps 1–9 of the founder's IA-first pipeline, and only with
certified product-truth capability ids. Pure stdlib. No I/O at import. An
incomplete brief is not claimed; the runner reports `needs-design-brief` and,
at most once, adds the existing Linear label so a design pass can write the
brief. Admission clears on its own once steps 1–9 are complete.
"""
from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path

# Marketing and landing surfaces. The CI check imports this tuple; do not
# copy it into a second list.
GATED_PATH_PREFIXES = (
    "apps/web/app/(marketing)/",
    "apps/web/app/(home)/",
    "apps/web/components/marketing/",
    "apps/web/data/marketing/",
)

# Explicit workstream labels. `ws:design-gate` is not in workstreams.RANK yet
# (JOV-7514 follow-up); `workstreams.explicit` parses the other two.
GATED_WS_LABELS = frozenset({
    "ws:ui-ia",
    "ws:profiles-marketing",
    "ws:design-gate",
})
GATED_WORKSTREAM_KEYS = frozenset({"ui-ia", "profiles-marketing"})

# Factory section catalog (apps/web/data/marketing/sections.ts MARKETING_SECTION_IDS).
SECTION_IDS = frozenset({
    "hero",
    "logo-cloud",
    "feature-grid",
    "feature-split",
    "how-it-works",
    "social-proof",
    "stats",
    "pricing",
    "comparison",
    "faq",
    "cta",
    "product-gallery",
    "spec-wall",
    "capture",
    "monetization",
    "ownership",
    "content-prose",
    "blog-feed",
})

# Step 7 imagery, case-insensitive; canonical spelling is lowercase.
IMAGERY_TYPES = frozenset({
    "video",
    "photo",
    "lottie",
    "callout",
    "phone mockup",
    "mac mockup",
})

NEEDS_BRIEF_LABEL = "needs-design-brief"
NEEDS_BRIEF_LABEL_ID = "5fa70dd4-2c23-4ed7-a6db-73bf4910b333"
NEEDS_BRIEF_REASON = "needs-design-brief"

# The brief lane is the same provider, run once per issue with a brief-only
# prompt. Its output lands inline in the issue under this marker; no PR is
# opened, so merge sync cannot close the issue before it is built.
BRIEF_MARKER = "<!-- design-gate:brief-lane -->"
BRIEF_FILE = ".design-brief.md"
# Remote-only lanes have no local worktree for the brief file.
BRIEF_SKIP_PROVIDERS = frozenset({"hyperagent"})

BRIEF_STEPS = tuple(range(1, 10))
_CERTIFIED_CACHE: dict | None = None

_SURFACE = re.compile(
    r"\b(?:homepages?|home pages?|landing[- ]pages?|marketing pages?|marketing landings?)\b",
    re.IGNORECASE,
)
_BRIEF_LINK = re.compile(r"(?im)^[ \t>*-]*design brief:[ \t]*(\S+)\s*$")
_HEADING = re.compile(r"(?m)^##[ \t]+(?P<step>10|[1-9])\.[ \t]+[^\n]*\n?")
_ID_LINE = re.compile(r"(?m)^[ \t]*[-*][ \t]+`?([a-z0-9]+(?:-[a-z0-9]+)*)`?[ \t]*$")
_SECTION_LINE = re.compile(r"(?m)^[ \t]*[-*][ \t]+`?([a-z][a-z0-9-]*)`?[ \t]*$")
_KEYED_LINE = re.compile(
    r"(?m)^[ \t]*[-*][ \t]+`?([a-z][a-z0-9-]*)`?[ \t]*:[ \t]*(.+?)\s*$")
_JOV_ISSUE = re.compile(r"\b(JOV-\d+)\b", re.IGNORECASE)
_PLACEHOLDER = re.compile(
    r"^(?:todo|tbd|n/?a|none|placeholder|fill|required|<.*>|\(.*\))\s*$",
    re.IGNORECASE,
)


def path_is_gated(path: str) -> bool:
    """True when a repo-relative path is a marketing or landing surface."""
    normalized = path.replace("\\", "/").lstrip("./")
    return any(normalized.startswith(prefix) for prefix in GATED_PATH_PREFIXES)


def _labels(issue) -> set[str]:
    return {str(label).strip().lower() for label in (getattr(issue, "labels", ()) or ())}


def _explicit_workstream(labels) -> str | None:
    """Reuse JOV-7514 label parsing when workstreams.py is importable."""
    try:
        import workstreams
    except ImportError:
        return None
    explicit = getattr(workstreams, "explicit", None)
    if not callable(explicit):
        return None
    try:
        return explicit(labels)
    except (TypeError, ValueError):
        return None


def targets_gated_surface(text: str) -> bool:
    """The issue names a gated path or a landing/homepage/marketing page."""
    normalized = (text or "").replace("\\", "/")
    if any(prefix in normalized for prefix in GATED_PATH_PREFIXES):
        return True
    return _SURFACE.search(normalized) is not None


def is_design_gated(issue) -> bool:
    """True for ws:ui-ia, ws:profiles-marketing, ws:design-gate, or a landing surface."""
    labels = getattr(issue, "labels", ()) or ()
    if _labels(issue) & GATED_WS_LABELS:
        return True
    if _explicit_workstream(labels) in GATED_WORKSTREAM_KEYS:
        return True
    title = getattr(issue, "title", "") or ""
    description = getattr(issue, "description", "") or ""
    return targets_gated_surface(f"{title}\n{description}")


def certified_catalog() -> dict:
    """Checked-in projection of the product-truth registry. Loaded on first use."""
    global _CERTIFIED_CACHE
    if _CERTIFIED_CACHE is None:
        path = Path(__file__).with_name("certified-capabilities.gen.json")
        _CERTIFIED_CACHE = json.loads(path.read_text(encoding="utf-8"))
    return _CERTIFIED_CACHE


def certified_ids() -> frozenset[str]:
    return frozenset(certified_catalog()["ids"])


def registry_ids() -> frozenset[str]:
    return frozenset(certified_catalog()["registryIds"])


def reset_catalog_cache() -> None:
    """Tests only."""
    global _CERTIFIED_CACHE
    _CERTIFIED_CACHE = None


# ---------------------------------------------------------------- registry sync

def _skip_string(source: str, index: int) -> int:
    quote = source[index]
    i = index + 1
    while i < len(source):
        if source[i] == "\\":
            i += 2
            continue
        if source[i] == quote:
            return i + 1
        i += 1
    return len(source)


def _skip_ws_and_comments(source: str, index: int) -> int:
    i = index
    while i < len(source):
        if source[i] in " \t\r\n":
            i += 1
            continue
        if source.startswith("//", i):
            newline = source.find("\n", i)
            i = len(source) if newline < 0 else newline + 1
            continue
        if source.startswith("/*", i):
            end = source.find("*/", i + 2)
            i = len(source) if end < 0 else end + 2
            continue
        break
    return i


def _matching_brace(source: str, index: int) -> int:
    depth = 0
    i = index
    while i < len(source):
        if source.startswith("//", i):
            newline = source.find("\n", i)
            i = len(source) if newline < 0 else newline + 1
            continue
        if source.startswith("/*", i):
            end = source.find("*/", i + 2)
            i = len(source) if end < 0 else end + 2
            continue
        char = source[i]
        if char in "'\"`":
            i = _skip_string(source, i)
            continue
        if char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                return i
        i += 1
    raise ValueError("unclosed capability block")


def _read_key(source: str, index: int) -> tuple[str, int]:
    if source[index] in "'\"":
        end = _skip_string(source, index)
        return source[index + 1:end - 1], end
    end = index
    while end < len(source) and (source[end].isalnum() or source[end] in "-_"):
        end += 1
    if end == index:
        raise ValueError(f"expected capability id near {source[index:index + 20]!r}")
    return source[index:end], end


def capability_blocks(source: str) -> list[tuple[str, str]]:
    """Top-level PRODUCT_CAPABILITIES entries as (id, object source)."""
    marker = "export const PRODUCT_CAPABILITIES = {"
    start = source.find(marker)
    if start < 0:
        raise ValueError("PRODUCT_CAPABILITIES not found")
    i = source.find("{", start) + 1
    blocks = []
    while i < len(source):
        i = _skip_ws_and_comments(source, i)
        if i >= len(source) or source[i] == "}":
            break
        key, i = _read_key(source, i)
        i = _skip_ws_and_comments(source, i)
        if i >= len(source) or source[i] != ":":
            raise ValueError(f"expected colon after {key}")
        i = _skip_ws_and_comments(source, i + 1)
        if i >= len(source) or source[i] != "{":
            raise ValueError(f"expected object for {key}")
        end = _matching_brace(source, i)
        blocks.append((key, source[i:end + 1]))
        i = _skip_ws_and_comments(source, end + 1)
        if i < len(source) and source[i] == ",":
            i += 1
    return blocks


def _strip_comments(text: str) -> str:
    """Drop // and /* */ comments so prose cannot look like a field."""
    out = []
    i = 0
    while i < len(text):
        if text.startswith("//", i):
            newline = text.find("\n", i)
            i = len(text) if newline < 0 else newline
            continue
        if text.startswith("/*", i):
            end = text.find("*/", i + 2)
            i = len(text) if end < 0 else end + 2
            continue
        if text[i] in "'\"`":
            end = _skip_string(text, i)
            out.append(text[i:end])
            i = end
            continue
        out.append(text[i])
        i += 1
    return "".join(out)


def capability_fields(block: str) -> dict:
    code = _strip_comments(block)
    maturity = re.search(r"\bmaturity\s*:\s*'([^']+)'", code)
    publication = re.search(r"\bpublication\s*:\s*'([^']+)'", code)
    access = re.search(r"\baccess\s*:\s*'([^']+)'", code)
    proof = re.search(r"\bproofAuthorized\s*:\s*(true|false)", code)
    return {
        "maturity": maturity.group(1) if maturity else None,
        "publication": publication.group(1) if publication else None,
        "access": access.group(1) if access else None,
        "proofAuthorized": None if proof is None else proof.group(1) == "true",
    }


def is_certified_fields(fields: dict) -> bool:
    """Certified claim: public, proof authorized, and not proposed or unavailable.

    `proofAuthorized` lives on the marketing block. A product-only record
    with no marketing proof is not claimable on a page. This is stricter than
    `isCapabilityIndexable` only in also rejecting `proposed` and `unavailable`;
    indexable already requires publication `public` and `proofAuthorized`.
    `jovie-card` is public and proof-authorized but still `proposed`, so it
    is not certified.
    """
    return (
        fields.get("publication") == "public"
        and fields.get("proofAuthorized") is True
        and fields.get("maturity") != "proposed"
        and fields.get("access") != "unavailable"
    )


def certified_ids_from_registry_source(source: str) -> tuple[list[str], list[str]]:
    """Return (certified ids, every registry id), both sorted."""
    certified = []
    every = []
    for capability_id, block in capability_blocks(source):
        every.append(capability_id)
        if is_certified_fields(capability_fields(block)):
            certified.append(capability_id)
    return sorted(certified), sorted(every)


# ---------------------------------------------------------------- brief

def find_brief_link(text: str) -> dict | None:
    """A `Design brief:` line. Repo paths under docs/design/ are readable locally.

    The first line wins. A GitHub URL that points at docs/design/*.md in this
    repo is treated as that path. Other URLs are recorded and not fetched.
    """
    match = _BRIEF_LINK.search(text or "")
    if not match:
        return None
    raw = match.group(1).strip().strip("<>")
    repo_path = None
    if raw.startswith("docs/design/") and raw.endswith(".md") and ".." not in raw.split("/"):
        repo_path = raw
    elif "/docs/design/" in raw and ".." not in raw:
        tail = raw.split("/docs/design/", 1)[1].split("?", 1)[0].split("#", 1)[0]
        if tail.endswith(".md") and ".." not in tail.split("/"):
            repo_path = "docs/design/" + tail
    kind = "repo" if repo_path else ("url" if raw.startswith(("http://", "https://")) else "other")
    return {"raw": raw, "repoPath": repo_path, "kind": kind}


def find_issue_identifier(text: str) -> str | None:
    match = _JOV_ISSUE.search(text or "")
    if not match:
        return None
    prefix, number = match.group(1).split("-", 1)
    return f"{prefix.upper()}-{number}"


def _section_bodies(text: str) -> dict[int, str]:
    matches = list(_HEADING.finditer(text or ""))
    bodies = {}
    for index, match in enumerate(matches):
        step = int(match.group("step"))
        end = matches[index + 1].start() if index + 1 < len(matches) else len(text)
        bodies[step] = text[match.end():end]
    return bodies


def _field(body: str, name: str) -> str:
    match = re.search(rf"(?im)^[ \t]*{re.escape(name)}:[ \t]*(.*)$", body or "")
    return match.group(1).strip() if match else ""


def _filled(value: str, min_len: int = 12) -> bool:
    text = (value or "").strip()
    if len(text) < min_len:
        return False
    if text.startswith(("<!--", "<")):
        return False
    return _PLACEHOLDER.match(text) is None


def _capability_ids(body: str) -> list[str]:
    return _ID_LINE.findall(body or "")


def _classify_capability(capability_id: str) -> dict | None:
    if capability_id not in registry_ids():
        return {"id": capability_id, "reason": "unknown"}
    if capability_id not in certified_ids():
        return {"id": capability_id, "reason": "uncertified"}
    return None


def _layout_sections(body: str) -> tuple[list[str], bool]:
    """Section ids from bullets. The bool is false when any bullet is unknown."""
    found = _SECTION_LINE.findall(body or "")
    if not found or any(section_id not in SECTION_IDS for section_id in found):
        return [], False
    return found, True


def _keyed(body: str) -> dict[str, str]:
    return {key: value.strip() for key, value in _KEYED_LINE.findall(body or "")}


def _imagery_ok(value: str) -> bool:
    return value.strip().lower() in IMAGERY_TYPES


def _artifact_ok(value: str) -> bool:
    text = (value or "").strip()
    if not _filled(text, min_len=4):
        return False
    lowered = text.lower()
    if lowered.startswith(("http://", "https://")):
        return True
    if "/" in text or ".pen" in lowered:
        return True
    if lowered.startswith("node ") and _filled(text[5:], min_len=3):
        return True
    return False


def _empty_status(source: str, link) -> dict:
    return {
        "complete": False,
        "missing": list(BRIEF_STEPS),
        "invalidCapabilityIds": [],
        "source": source,
        "link": link,
    }


def brief_status(issue_text: str, linked_doc_text: str | None = None) -> dict:
    """Completeness of steps 1–9 plus any invalid capability ids.

    A `Design brief:` line means the brief is the linked document. Pass that
    document as `linked_doc_text`. Without it the brief is unverified and
    every step is missing. With no link, the issue text itself is the brief.
    """
    issue_text = issue_text or ""
    link = find_brief_link(issue_text)
    if link:
        if linked_doc_text is None:
            return _empty_status("linked-unloaded", link)
        text = linked_doc_text
        source = "linked"
    else:
        text = issue_text
        source = "inline"
    bodies = _section_bodies(text)
    missing = []
    invalid = []

    if not _filled(_field(bodies.get(1, ""), "Message")):
        missing.append(1)

    ids = _capability_ids(bodies.get(2, ""))
    for capability_id in ids:
        problem = _classify_capability(capability_id)
        if problem:
            invalid.append(problem)
    if not ids or invalid:
        missing.append(2)

    if not _filled(_field(bodies.get(3, ""), "Outcome")):
        missing.append(3)

    problem = _field(bodies.get(4, ""), "Problem")
    solution = _field(bodies.get(4, ""), "Solution")
    if not _filled(problem) or not _filled(solution):
        missing.append(4)

    sections, layout_ok = _layout_sections(bodies.get(5, ""))
    if not layout_ok:
        missing.append(5)

    copies = _keyed(bodies.get(6, ""))
    if not sections or any(not _filled(copies.get(section_id, "")) for section_id in sections):
        missing.append(6)

    imagery = _keyed(bodies.get(7, ""))
    if (not sections or any(section_id not in imagery or not _imagery_ok(imagery[section_id])
                            for section_id in sections)
            or any(not _imagery_ok(value) for value in imagery.values())):
        missing.append(7)

    components = re.findall(r"(?im)^[ \t]*Component:[ \t]*(.*)$", bodies.get(8, ""))
    if len(components) != 1 or "," in components[0] or not _filled(components[0], min_len=2):
        missing.append(8)

    pen = _field(bodies.get(9, ""), "Pen")
    imagegen = _field(bodies.get(9, ""), "ImageGen")
    if not (_artifact_ok(pen) or _artifact_ok(imagegen)):
        missing.append(9)

    return {
        "complete": not missing and not invalid,
        "missing": missing,
        "invalidCapabilityIds": invalid,
        "source": source,
        "link": link,
    }


def build_admission(issue, linked_doc_text: str | None = None, read_text=None) -> dict:
    """Admit, or `needs-design-brief` with the missing steps.

    `read_text(repo_path)` optionally loads a `docs/design/*.md` link. Ungated
    issues are admitted without reading a brief.
    """
    if not is_design_gated(issue):
        return {
            "admit": True, "reason": None, "gated": False, "missing": [],
            "invalidCapabilityIds": [], "source": None,
        }
    description = getattr(issue, "description", "") or ""
    link = find_brief_link(description)
    doc = linked_doc_text
    if link and link["repoPath"] and doc is None and read_text is not None:
        try:
            doc = read_text(link["repoPath"])
        except OSError:
            doc = None
    status = brief_status(description, doc if link else None)
    admit = bool(status["complete"])
    return {
        "admit": admit,
        "reason": None if admit else NEEDS_BRIEF_REASON,
        "gated": True,
        "missing": status["missing"],
        "invalidCapabilityIds": status["invalidCapabilityIds"],
        "source": status["source"],
    }


def empty_census() -> dict:
    return {
        "gated": 0,
        "admitted": 0,
        "needsBrief": 0,
        "missingSteps": {str(step): 0 for step in BRIEF_STEPS},
    }


def apply_to_pool(qualified_by_provider: dict, rejected: dict, read_text=None) -> dict:
    """Drop incomplete briefs from an already-admitted pool and count them.

    Census is deduped by issue identifier. Rejection counts stay per provider,
    matching the rest of the admission census. Ungated issues are unchanged.
    """
    census = empty_census()
    seen: dict[str, dict] = {}
    for name, issues in list(qualified_by_provider.items()):
        kept = []
        for issue in issues:
            key = getattr(issue, "identifier", None) or str(id(issue))
            if key not in seen:
                seen[key] = build_admission(issue, read_text=read_text)
                decision = seen[key]
                if decision["gated"]:
                    census["gated"] += 1
                    if decision["admit"]:
                        census["admitted"] += 1
                    else:
                        census["needsBrief"] += 1
                        for step in decision["missing"]:
                            census["missingSteps"][str(step)] += 1
            decision = seen[key]
            if decision["admit"]:
                kept.append(issue)
            else:
                bucket = rejected.setdefault(name, {})
                reason = decision["reason"] or NEEDS_BRIEF_REASON
                bucket[reason] = bucket.get(reason, 0) + 1
        qualified_by_provider[name] = kept
    return census


def repo_reader(repo):
    if repo is None:
        return None
    root = Path(repo)

    def read_text(path: str) -> str:
        return (root / path).read_text(encoding="utf-8")

    return read_text


def ensure_needs_brief_label(linear, issue, decision: dict) -> bool:
    """Add `needs-design-brief` once. False when the issue already has it."""
    if NEEDS_BRIEF_LABEL in _labels(issue):
        return False
    linear.gql(
        "mutation($id:String!,$label:String!){issueUpdate(id:$id,input:{addedLabelIds:[$label]}){success}}",
        {"id": issue.id, "label": NEEDS_BRIEF_LABEL_ID},
    )
    missing = ", ".join(str(step) for step in decision["missing"]) or "unknown"
    invalid = decision.get("invalidCapabilityIds") or []
    extra = ""
    if invalid:
        extra = " Invalid capability ids: " + ", ".join(
            f"{row['id']} ({row['reason']})" for row in invalid) + "."
    linear.comment(
        issue.id,
        "🤖 design gate: needs-design-brief. Build lanes will not claim this until "
        f"steps {missing} are complete in the issue or a linked design brief.{extra} "
        "The brief lane drafts it once, inline; anything it cannot fill (often the "
        "step 9 Pen or ImageGen artifact) needs a design pass against "
        "docs/design/design-brief-template.md. "
        "Admission clears on its own once steps 1–9 are complete.",
    )
    return True


def report_needs_brief(issue, decision: dict, linear=None) -> None:
    """Record the reason. Label at most once, and never in bulk."""
    missing = ",".join(str(step) for step in decision["missing"])
    sys.stderr.write(f"needs-design-brief {issue.identifier} missing={missing}\n")
    if linear is None:
        return
    try:
        ensure_needs_brief_label(linear, issue, decision)
    except Exception as error:
        sys.stderr.write(
            f"needs-design-brief label skipped: {type(error).__name__}: {error}\n")


def pick_build_issue(issues, failures, *, pick, linear=None, repo=None,
                     now=None, in_flight=frozenset(), provider=None):
    """The build-lane admission wrapper around `pick`.

    The issue `pick` would have claimed is labeled `needs-design-brief` when
    its brief is incomplete. It is returned for one brief-lane run when
    `brief_due`; otherwise it is skipped and the next admissible issue is
    returned. Later incomplete issues in the same pass are not labeled.
    """
    remaining = list(issues)
    reader = repo_reader(repo)
    reported = False
    while remaining:
        chosen = pick(remaining, failures, now=now, in_flight=in_flight, provider=provider)
        if chosen is None:
            return None
        decision = build_admission(chosen, read_text=reader)
        if decision["admit"]:
            return chosen
        if not reported:
            report_needs_brief(chosen, decision, linear)
            reported = True
        if provider not in BRIEF_SKIP_PROVIDERS and brief_due(chosen, decision):
            return chosen
        remaining = [item for item in remaining if item.identifier != chosen.identifier]
    return None


def brief_due(issue, decision: dict) -> bool:
    """Gated, incomplete, inline (no linked doc), and the brief lane has not run."""
    description = getattr(issue, "description", "") or ""
    return (decision["gated"] and not decision["admit"]
            and find_brief_link(description) is None and BRIEF_MARKER not in description)


def wants_brief(issue, repo=None) -> bool:
    """The runner's mode switch: True means run the brief lane, not a build."""
    return brief_due(issue, build_admission(issue, read_text=repo_reader(repo)))


def render_brief_prompt(issue, context_pack: str = "") -> str:
    """Brief-only instructions. Steps the agent cannot ground stay empty."""
    return "\n".join([
        f"# Design brief for {issue.title} ({issue.identifier})",
        "",
        getattr(issue, "description", "") or "(no description)",
        "",
        "---",
        "## Company context (GBrain; verify against source)",
        context_pack or "(GBrain unavailable for this run; rely on repo docs.)",
        "",
        "## Contract (design/brief lane, JOV-7541)",
        "- This run writes the design brief only. Do not build, commit, push or open a PR.",
        f"- Write `{BRIEF_FILE}` at the repository root, copying the headings `## 1.` through",
        "  `## 9.` and their field lines from docs/design/design-brief-template.md. The lane",
        "  validates it and appends it to the issue.",
        "- Step 2 cites only ids from scripts/lanes/certified-capabilities.gen.json `ids`.",
        "  Steps 5 to 7 use only the section ids and imagery types the template lists.",
        "- Step 9 needs a real Pen node or ImageGen artifact. If this run cannot produce",
        "  one, leave the `Pen:` and `ImageGen:` lines empty; a design pass fills them.",
        "- Never invent a capability, claim, artifact or reference. An empty field is",
        "  correct when the source does not support a value.",
        "- You are unattended: nobody will answer a question. Do not run skill workflows.",
    ])


def publish_brief(linear, issue, text: str) -> dict:
    """Append the lane's brief inline, once, and report what is still missing."""
    text = (text or "").strip()
    if not _section_bodies(text):
        return {"verdict": "failed", "reasons": ["brief-empty"]}
    current = linear.gql("query($id:String!){issue(id:$id){description}}", {"id": issue.id})
    description = ((current.get("issue") or {}).get("description") or "").rstrip()
    if BRIEF_MARKER in description:  # a stale claim-scan cache; the first run stands
        return {"verdict": "brief-incomplete", "missing": brief_status(description)["missing"],
                "reasons": ["brief-already-published"]}
    updated = f"{description}\n\n{BRIEF_MARKER}\n{text}\n"
    linear.gql(
        "mutation($id:String!,$d:String!){issueUpdate(id:$id,input:{description:$d}){success}}",
        {"id": issue.id, "d": updated},
    )
    status = brief_status(updated)
    if status["complete"]:
        linear.gql(
            "mutation($id:String!,$label:String!){issueUpdate(id:$id,input:{removedLabelIds:[$label]}){success}}",
            {"id": issue.id, "label": NEEDS_BRIEF_LABEL_ID},
        )
        body = "🤖 design/brief lane: steps 1–9 complete inline. A build lane admits this next."
    else:
        missing = ", ".join(str(step) for step in status["missing"])
        body = ("🤖 design/brief lane: drafted the brief inline. Steps "
                f"{missing} still need a design pass; the lane does not run again for this issue.")
    linear.comment(issue.id, body)
    return {"verdict": "brief-complete" if status["complete"] else "brief-incomplete",
            "missing": status["missing"], "reasons": []}


def enforce_enabled(value: str | None = None) -> bool:
    """`DESIGN_GATE_ENFORCE` blocks CI only when it is truthy. Default off."""
    raw = os.environ.get("DESIGN_GATE_ENFORCE", "") if value is None else value
    return str(raw).strip().lower() in {"1", "true", "yes", "on"}
