#!/usr/bin/env python3
"""Design gate for Symphony build lanes (JOV-7541).

UI and landing work is admitted to a build lane only after a design brief
completes steps 1–9 of the founder's IA-first pipeline, and only with
certified product-truth capability ids. Pure stdlib. No I/O at import. An
incomplete brief is not claimed; the runner reports `needs-design-brief` and,
at most once, adds the existing Linear label so a design pass can write the
brief. Admission clears on its own once steps 1–9 are complete.

Anti-stall (JOV-7717): a held issue gets a brief run on the next claim, then
one frontier retry; after that, or 24h after it was first held, it is admitted
as `brief-auto` and the open taste call goes to Tim as one founder work order.
App-UI issues use their own steps 5–7 (screens/states, canonical primitives,
viewports); marketing keeps sections, copy and imagery.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import sys
import time
from datetime import datetime, timedelta, timezone
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
# The second (last) brief run goes to the frontier lane, filling from canon.
BRIEF_RETRY_MARKER = "<!-- design-gate:brief-retry -->"
BRIEF_RETRY_PROVIDER = "codex"
# First hold time, written once when the label is applied.
_HELD_MARKER = re.compile(r"<!-- design-gate:held-at=([0-9T:+.Z-]+) -->")
# A held issue is never blocked past this; doctor alerts after the grace.
HOLD_LIMIT_S = 24 * 3600
HOLD_ALERT_S = HOLD_LIMIT_S + 3600
BRIEF_AUTO_LABEL = "brief-auto"
BRIEF_AUTO_LABEL_ID = "19aa571f-3e18-499e-8256-64f62d478134"
BRIEF_AUTO_REASON = "brief-auto"

# App-UI brief steps 5–7 (JOV-7713 class 6 state vocabulary).
APP_UI_STATES = frozenset({
    "loading", "empty", "populated", "partial", "error", "retry", "success",
    "disabled", "locked", "offline", "stale", "refreshing", "confirm",
})
APP_UI_VIEWPORTS = frozenset({"mobile", "tablet", "desktop", "mac-app", "ios"})
TEMPLATES = {
    "marketing": "docs/design/design-brief-template.md",
    "app": "docs/design/app-ui-brief-template.md",
}
_PRIMITIVES_CACHE: dict | None = None

# Titles that are routing or backend plumbing, not a visible UI change.
_PLUMBING = re.compile(
    r"\b(?:redirect(?:s|ed|ing)?|rewrites?|alias(?:es)?|unlinked|orphan(?:ed)?|sitemaps?|"
    r"robots\.txt|api routes?|route handlers?|endpoints?|webhooks?|cron(?:s| jobs?)?|"
    r"migrations?|backend)\b",
    re.IGNORECASE,
)

BRIEF_STEPS = tuple(range(1, 10))
_CERTIFIED_CACHE: dict | None = None

_SURFACE = re.compile(
    r"\b(?:homepages?|home pages?|landing[- ]pages?|marketing pages?|marketing landings?)\b",
    re.IGNORECASE,
)
_BRIEF_LINK = re.compile(r"(?im)^[ \t>*-]*design brief:[ \t]*(\S+)\s*$")
_HEADING = re.compile(r"(?m)^##[ \t]+(?P<step>10|[1-9])\.[ \t]+[^\n]*\n?")
_ID_LINE = re.compile(r"(?m)^[ \t]*[-*][ \t]+`?([a-z0-9]+(?:-[a-z0-9]+)*)`?[ \t]*$")
_PRIMITIVE_LINE = re.compile(
    r"(?m)^[ \t]*[-*][ \t]+`?([a-z]+\.[a-z0-9]+(?:-[a-z0-9]+)*)`?[ \t]*$")
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


def changes_visible_ui(issue) -> bool:
    """False for redirects, aliases, orphans and backend/route plumbing titles."""
    return _PLUMBING.search(getattr(issue, "title", "") or "") is None


def _gated_path_in(issue) -> bool:
    description = (getattr(issue, "description", "") or "").replace("\\", "/")
    return any(prefix in description for prefix in GATED_PATH_PREFIXES)


def is_design_gated(issue) -> bool:
    """Visible-UI work with ws:ui-ia, ws:profiles-marketing, ws:design-gate, a
    landing surface in the title, or a gated path in the description.

    A homepage or landing page merely mentioned in the description (a link,
    context) does not gate; neither does routing or backend plumbing.
    """
    if not changes_visible_ui(issue):
        return False
    labels = getattr(issue, "labels", ()) or ()
    if _labels(issue) & GATED_WS_LABELS:
        return True
    if _explicit_workstream(labels) in GATED_WORKSTREAM_KEYS:
        return True
    return _gated_path_in(issue) or targets_gated_surface(getattr(issue, "title", "") or "")


def brief_variant(issue) -> str:
    """`marketing` for landing/marketing surfaces, otherwise `app`."""
    labels = getattr(issue, "labels", ()) or ()
    if "ws:profiles-marketing" in _labels(issue) or _explicit_workstream(labels) == "profiles-marketing":
        return "marketing"
    if _gated_path_in(issue) or targets_gated_surface(getattr(issue, "title", "") or ""):
        return "marketing"
    return "app"


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


def primitive_ids() -> frozenset[str]:
    """Checked-in projection of the canonical UI primitive registries."""
    global _PRIMITIVES_CACHE
    if _PRIMITIVES_CACHE is None:
        path = Path(__file__).with_name("app-ui-primitives.gen.json")
        _PRIMITIVES_CACHE = json.loads(path.read_text(encoding="utf-8"))
    return frozenset(_PRIMITIVES_CACHE["ids"])


def primitive_ids_from_sources(component_registry: str, app_screen_registry: str) -> list[str]:
    """`DESIGN_SYSTEM_COMPONENT_IDS` plus the `AppScreenComponentId` union."""
    ids = []
    match = re.search(r"DESIGN_SYSTEM_COMPONENT_IDS\s*=\s*\[(.*?)\]", component_registry, re.S)
    if match:
        ids += re.findall(r"'([a-z]+\.[a-z0-9-]+)'", match.group(1))
    match = re.search(r"type AppScreenComponentId\s*=(.*?);", app_screen_registry, re.S)
    if match:
        ids += re.findall(r"'(component\.[a-z0-9-]+)'", match.group(1))
    return sorted(set(ids))


def reset_catalog_cache() -> None:
    """Tests only."""
    global _CERTIFIED_CACHE, _PRIMITIVES_CACHE
    _CERTIFIED_CACHE = None
    _PRIMITIVES_CACHE = None


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


def _marketing_steps_missing(bodies: dict[int, str]) -> list[int]:
    missing = []
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
    return missing


def _vocabulary_list(value: str, allowed: frozenset[str]) -> bool:
    items = [item.strip().lower() for item in (value or "").split(",")]
    return bool(items) and all(item in allowed for item in items)


def _app_steps_missing(bodies: dict[int, str]) -> list[int]:
    """5: `- screen: loading, empty, error`; 6: primitive ids; 7: `- screen: mobile, desktop`."""
    missing = []
    states = _keyed(bodies.get(5, ""))
    if not states or any(not _vocabulary_list(value, APP_UI_STATES) for value in states.values()):
        missing.append(5)

    primitives = _PRIMITIVE_LINE.findall(bodies.get(6, ""))
    if not primitives or any(item not in primitive_ids() for item in primitives):
        missing.append(6)

    viewports = _keyed(bodies.get(7, ""))
    if (not states or any(screen not in viewports for screen in states)
            or any(not _vocabulary_list(value, APP_UI_VIEWPORTS) for value in viewports.values())):
        missing.append(7)
    return missing


def _empty_status(source: str, link) -> dict:
    return {
        "complete": False,
        "missing": list(BRIEF_STEPS),
        "invalidCapabilityIds": [],
        "source": source,
        "link": link,
    }


def brief_status(issue_text: str, linked_doc_text: str | None = None,
                 variant: str = "marketing") -> dict:
    """Completeness of steps 1–9 plus any invalid capability ids.

    `variant="app"` checks steps 5–7 as screens/states, canonical primitives
    and viewports instead of marketing sections, copy and imagery.

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

    missing += _app_steps_missing(bodies) if variant == "app" else _marketing_steps_missing(bodies)

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


def held_at(description: str) -> float | None:
    """Epoch seconds of the first hold, or None before the gate held it."""
    match = _HELD_MARKER.search(description or "")
    if not match:
        return None
    try:
        return datetime.fromisoformat(match.group(1).replace("Z", "+00:00")).timestamp()
    except ValueError:
        return None


def held_marker(now: float) -> str:
    stamp = datetime.fromtimestamp(now, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    return f"<!-- design-gate:held-at={stamp} -->"


def brief_attempts(description: str) -> int:
    """Brief-lane runs recorded on the issue: 0, 1 (first) or 2 (frontier retry)."""
    description = description or ""
    return int(BRIEF_MARKER in description) + int(BRIEF_RETRY_MARKER in description)


def build_admission(issue, linked_doc_text: str | None = None, read_text=None,
                    now: float | None = None) -> dict:
    """Admit, `brief-auto`, or `needs-design-brief` with the missing steps.

    `read_text(repo_path)` optionally loads a `docs/design/*.md` link. Ungated
    issues are admitted without reading a brief. An incomplete brief is
    admitted as `brief-auto` after both brief runs, or once it has been held
    for HOLD_LIMIT_S: the gate never holds an issue indefinitely.
    """
    if not is_design_gated(issue):
        return {
            "admit": True, "reason": None, "gated": False, "missing": [],
            "invalidCapabilityIds": [], "source": None, "auto": False,
            "variant": None, "heldAt": None, "attempts": 0,
        }
    now = time.time() if now is None else now
    description = getattr(issue, "description", "") or ""
    link = find_brief_link(description)
    doc = linked_doc_text
    if link and link["repoPath"] and doc is None and read_text is not None:
        try:
            doc = read_text(link["repoPath"])
        except OSError:
            doc = None
    variant = brief_variant(issue)
    status = brief_status(description, doc if link else None, variant=variant)
    held = held_at(description)
    attempts = brief_attempts(description)
    complete = bool(status["complete"])
    auto = not complete and (attempts >= 2 or (held is not None and now - held >= HOLD_LIMIT_S))
    return {
        "admit": complete or auto,
        "reason": None if complete else (BRIEF_AUTO_REASON if auto else NEEDS_BRIEF_REASON),
        "gated": True,
        "missing": status["missing"],
        "invalidCapabilityIds": status["invalidCapabilityIds"],
        "source": status["source"],
        "auto": auto,
        "variant": variant,
        "heldAt": held,
        "attempts": attempts,
    }


AGE_BUCKETS = ("<1h", "1-6h", "6-24h", ">=24h", "unknown")


def _age_bucket(held: float | None, now: float) -> str:
    if held is None:
        return "unknown"
    age = now - held
    if age < 3600:
        return "<1h"
    if age < 6 * 3600:
        return "1-6h"
    if age < HOLD_LIMIT_S:
        return "6-24h"
    return ">=24h"


def empty_census() -> dict:
    return {
        "gated": 0,
        "admitted": 0,
        "autoAdmitted": 0,
        "needsBrief": 0,
        "missingSteps": {str(step): 0 for step in BRIEF_STEPS},
        "ageHistogram": {bucket: 0 for bucket in AGE_BUCKETS},
        "stale": [],
    }


def apply_to_pool(qualified_by_provider: dict, rejected: dict, read_text=None,
                  now: float | None = None) -> dict:
    """Drop incomplete briefs from an already-admitted pool and count them.

    Census is deduped by issue identifier. Rejection counts stay per provider,
    matching the rest of the admission census. Ungated issues are unchanged.
    `ageHistogram` buckets every issue still carrying `needs-design-brief`
    by time since its first hold; `stale` lists those held past
    HOLD_ALERT_S. An admitted-but-unclaimed issue still carrying the label
    lands here too, so staleness means "no build claim", not "the escape
    did not fire".
    """
    now = time.time() if now is None else now
    census = empty_census()
    seen: dict[str, dict] = {}
    for name, issues in list(qualified_by_provider.items()):
        kept = []
        for issue in issues:
            key = getattr(issue, "identifier", None) or str(id(issue))
            if key not in seen:
                seen[key] = build_admission(issue, read_text=read_text, now=now)
                decision = seen[key]
                if decision["gated"]:
                    census["gated"] += 1
                    if decision["admit"]:
                        census["admitted"] += 1
                        census["autoAdmitted"] += int(decision["auto"])
                    else:
                        census["needsBrief"] += 1
                        for step in decision["missing"]:
                            census["missingSteps"][str(step)] += 1
                    if not decision["admit"] or NEEDS_BRIEF_LABEL in _labels(issue):
                        census["ageHistogram"][_age_bucket(decision["heldAt"], now)] += 1
                        held = decision["heldAt"]
                        if held is not None and now - held >= HOLD_ALERT_S:
                            census["stale"].append(key)
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


def _description(linear, issue) -> str:
    current = linear.gql("query($id:String!){issue(id:$id){description}}", {"id": issue.id})
    return ((current or {}).get("issue") or {}).get("description") or ""


def _set_description(linear, issue, description: str) -> None:
    linear.gql(
        "mutation($id:String!,$d:String!){issueUpdate(id:$id,input:{description:$d}){success}}",
        {"id": issue.id, "d": description},
    )


def _add_label(linear, issue, label_id: str) -> None:
    linear.gql(
        "mutation($id:String!,$label:String!){issueUpdate(id:$id,input:{addedLabelIds:[$label]}){success}}",
        {"id": issue.id, "label": label_id},
    )


def ensure_needs_brief_label(linear, issue, decision: dict, now: float | None = None) -> bool:
    """Add `needs-design-brief` and the first-hold time once each.

    False when the issue already had the label.
    """
    now = time.time() if now is None else now
    if held_at(getattr(issue, "description", "") or "") is None:
        current = _description(linear, issue).rstrip()
        if held_at(current) is None:
            _set_description(linear, issue, f"{current}\n\n{held_marker(now)}\n")
    if NEEDS_BRIEF_LABEL in _labels(issue):
        return False
    _add_label(linear, issue, NEEDS_BRIEF_LABEL_ID)
    missing = ", ".join(str(step) for step in decision["missing"]) or "unknown"
    invalid = decision.get("invalidCapabilityIds") or []
    extra = ""
    if invalid:
        extra = " Invalid capability ids: " + ", ".join(
            f"{row['id']} ({row['reason']})" for row in invalid) + "."
    template = TEMPLATES.get(decision.get("variant") or "marketing", TEMPLATES["marketing"])
    linear.comment(
        issue.id,
        "🤖 design gate: needs-design-brief. Build lanes will not claim this until "
        f"steps {missing} are complete in the issue or a linked design brief ({template}).{extra} "
        "The brief lane drafts it on the next claim, then one frontier retry fills gaps from "
        "canon. If steps are still missing after that, or 24h from now, it is admitted as "
        "`brief-auto` and the open taste call goes to Tim as one Ovie decision.",
    )
    return True


def report_needs_brief(issue, decision: dict, linear=None, now: float | None = None) -> None:
    """Record the reason. Label at most once, and never in bulk."""
    missing = ",".join(str(step) for step in decision["missing"])
    sys.stderr.write(f"needs-design-brief {issue.identifier} missing={missing}\n")
    if linear is None:
        return
    try:
        ensure_needs_brief_label(linear, issue, decision, now=now)
    except Exception as error:
        sys.stderr.write(
            f"needs-design-brief label skipped: {type(error).__name__}: {error}\n")


def founder_order(issue, decision: dict, now: float) -> dict:
    """One `jovie.work-order/v1` founder decision for a brief-auto admission.

    Summer's founder path (JOV-7739) reads open founder orders from issue
    descriptions and posts them to Ovie with no model turn. The digest is
    left to `sealWorkOrder`.
    """
    stamp = datetime.fromtimestamp(now, timezone.utc)
    iso = stamp.strftime("%Y-%m-%dT%H:%M:%SZ")
    missing = ", ".join(str(step) for step in decision["missing"]) or "none"
    identifier = issue.identifier
    title = getattr(issue, "title", "") or identifier
    return {
        "schema": "jovie.work-order/v1",
        "orderId": f"design-brief-{identifier.lower()}",
        "revision": 1,
        "idempotencyKey": f"design-brief-{identifier.lower()}",
        "gate": {"objectiveRef": identifier, "gateId": "design-brief"},
        "state": "open",
        "title": f"Design taste call: {title}"[:120],
        "outcome": (f"Tim decides the open design taste call for {identifier}: steps {missing} "
                    "of its design brief were not filled after two brief runs or 24h, so it "
                    "was built as brief-auto from canon."),
        "successPredicate": {"id": "p-design-taste", "verifier": "founder-record",
                             "statement": "Founder decision recorded on the issue"},
        "requiredCapabilities": ["taste"],
        "riskTier": "low",
        "authorityClass": "founder",
        "scope": {"target": "JovieInc/Jovie", "entityRefs": [identifier]},
        "evidence": [{"ref": f"linear:{identifier}", "observedAt": iso, "freshness": "fresh"}],
        "permittedActions": ["decision"],
        "forbiddenActions": [],
        "budget": {"deadline": (stamp + timedelta(days=7)).strftime("%Y-%m-%dT%H:%M:%SZ"),
                   "maxAttempts": 1, "maxSpendUsd": 0, "maxConcurrency": 1, "founderMinutes": 5},
        "stopConditions": ["The issue is canceled or its brief is completed by a design pass"],
        "escalation": {"owner": "summer", "action": "Keep the build as shipped; revisit in the next design pass"},
        "expectedArtifact": {"kind": "decision-record", "description": "Ovie decision on the brief-auto build"},
        "founderAsk": {
            "whyNow": "The design gate never blocks indefinitely, so this shipped without a complete brief.",
            "blocked": f"Design brief steps {missing} for {identifier}",
            "options": [
                {"id": "keep", "label": "keep",
                 "tradeoff": "Accept the canon-derived design as built; no follow-up"},
                {"id": "redesign", "label": "redesign",
                 "tradeoff": "Open a design pass (Pen) for the missing steps and rebuild"},
            ],
            "recommendation": "keep",
            "defaultIfSilent": "keep",
            "materialChange": None,
        },
        "replyTo": {"kind": "linear-comment", "ref": identifier},
        "createdAt": iso,
        "createdBy": "lanes-design-gate",
    }


def render_order_block(order: dict) -> str:
    """Same marker and fenced block as `renderWorkBlock` in work-order.ts."""
    key = hashlib.sha256(order["idempotencyKey"].encode("utf-8")).hexdigest()[:16]
    return (f"<!-- jovie-work-order:{key}:r{order['revision']} -->\n"
            f"```json\n{json.dumps(order, indent=2)}\n```")


def ensure_brief_auto(linear, issue, decision: dict, now: float | None = None) -> bool:
    """Label `brief-auto`, warn, and file the founder taste decision once."""
    if BRIEF_AUTO_LABEL in _labels(issue):
        return False
    now = time.time() if now is None else now
    order = founder_order(issue, decision, now)
    current = _description(linear, issue).rstrip()
    if f'"orderId": "{order["orderId"]}"' not in current:
        _set_description(linear, issue, f"{current}\n\n{render_order_block(order)}\n")
    _add_label(linear, issue, BRIEF_AUTO_LABEL_ID)
    missing = ", ".join(str(step) for step in decision["missing"]) or "none"
    linear.comment(
        issue.id,
        f"⚠️ design gate: brief-auto. Admitted to build with brief steps {missing} incomplete "
        f"({'two brief runs' if decision.get('attempts', 0) >= 2 else 'held 24h'}). Build from "
        "canon inside the existing guardrails. The taste call goes to Tim as one Ovie decision "
        f"(work order `{order['orderId']}`).",
    )
    return True


def brief_due(issue, decision: dict) -> bool:
    """Held, inline (no linked doc), and fewer than two brief runs recorded."""
    description = getattr(issue, "description", "") or ""
    return (decision["gated"] and not decision["admit"]
            and find_brief_link(description) is None and brief_attempts(description) < 2)


def wants_brief(issue, repo=None, now=None) -> bool:
    """The runner's mode switch: True means run the brief lane, not a build."""
    return brief_due(issue, build_admission(issue, read_text=repo_reader(repo), now=now))


def brief_retry(issue) -> bool:
    """The next brief run is the frontier retry."""
    return BRIEF_MARKER in (getattr(issue, "description", "") or "")


def pick_build_issue(issues, failures, *, pick, linear=None, repo=None,
                     now=None, in_flight=frozenset(), provider=None):
    """The build-lane admission wrapper around `pick`.

    Held issues come first: among issues whose brief run is due, `pick`'s own
    order and eligibility choose one, so a held issue gets its brief run on
    the next claim instead of waiting behind the whole pool. Once `brief-auto`
    admits a held issue, it keeps that priority until its build claim. Otherwise
    the first admissible issue is returned. A `brief-auto` admission is labeled
    and filed for the founder once. An issue that is neither (a linked brief
    still incomplete, or a remote-only lane) is labeled once and skipped.
    """
    reader = repo_reader(repo)
    decisions = {}

    def admission(issue):
        if issue.identifier not in decisions:
            decisions[issue.identifier] = build_admission(issue, read_text=reader, now=now)
        return decisions[issue.identifier]

    # Explicit bottleneck work must also win this wrapper's brief-priority pass.
    # Only already build-admissible pool issues qualify; the ordinary brief path
    # remains responsible for a designated issue whose design evidence is missing.
    designated = lambda issue: {"agent-ready", "dispatch-next"} <= {label.lower() for label in issue.labels}
    # Select against the whole pool, so a designated non-canonical duplicate
    # cannot hide its canonical sibling from the claim predicate.
    chosen = (pick(issues, failures, now=now, in_flight=in_flight, provider=provider)
              if any(designated(issue) for issue in issues) else None)
    if chosen is not None and designated(chosen) and admission(chosen)["admit"]:
        decision = admission(chosen)
        if decision["auto"] and linear is not None:
            try:
                ensure_brief_auto(linear, chosen, decision, now=now)
            except Exception as error:
                sys.stderr.write(f"brief-auto record skipped: {type(error).__name__}: {error}\n")
        return chosen

    auto_admitted = [issue for issue in issues
                     if NEEDS_BRIEF_LABEL in _labels(issue) and admission(issue)["auto"]]
    chosen = (pick(auto_admitted, failures, now=now, in_flight=in_flight, provider=provider)
              if auto_admitted else None)
    if chosen is not None:
        if linear is not None:
            try:
                ensure_brief_auto(linear, chosen, admission(chosen), now=now)
            except Exception as error:
                sys.stderr.write(f"brief-auto record skipped: {type(error).__name__}: {error}\n")
        return chosen

    if provider not in BRIEF_SKIP_PROVIDERS:
        due = [issue for issue in issues
               if is_design_gated(issue) and brief_due(issue, admission(issue))]
        chosen = pick(due, failures, now=now, in_flight=in_flight, provider=provider) if due else None
        if chosen is not None:
            report_needs_brief(chosen, admission(chosen), linear, now=now)
            return chosen
    remaining = list(issues)
    reported = False
    while remaining:
        chosen = pick(remaining, failures, now=now, in_flight=in_flight, provider=provider)
        if chosen is None:
            return None
        decision = admission(chosen)
        if decision["admit"]:
            if decision["auto"] and linear is not None:
                try:
                    ensure_brief_auto(linear, chosen, decision, now=now)
                except Exception as error:
                    sys.stderr.write(f"brief-auto record skipped: {type(error).__name__}: {error}\n")
            return chosen
        if not reported:
            report_needs_brief(chosen, decision, linear, now=now)
            reported = True
        remaining = [item for item in remaining if item.identifier != chosen.identifier]
    return None


def render_brief_prompt(issue, context_pack: str = "", retry: bool = False,
                        missing=()) -> str:
    """Brief-only instructions. Steps the agent cannot ground stay empty."""
    template = TEMPLATES[brief_variant(issue)]
    retry_lines = []
    if retry:
        steps = ", ".join(str(step) for step in missing) or "any"
        retry_lines = [
            f"- Frontier retry (last brief run). Steps {steps} are still incomplete in the",
            "  draft above. Fill them from canon: DESIGN.md, canon/DESIGN.md,",
            "  apps/web/data/designSystem/componentRegistry.ts, apps/web/data/appScreens/registry.ts,",
            "  apps/web/data/marketing/sections.ts and scripts/lanes/certified-capabilities.gen.json.",
            "  Write the complete brief (all of steps 1-9), not only the gaps.",
        ]
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
        f"  `## 9.` and their field lines from {template}. The lane",
        "  validates it and appends it to the issue.",
        "- Step 2 cites only ids from scripts/lanes/certified-capabilities.gen.json `ids`.",
        "  Steps 5 to 7 use only the ids, states, imagery types and viewports the template lists.",
        "- Step 9 needs a real Pen node or ImageGen artifact. If this run cannot produce",
        "  one, leave the `Pen:` and `ImageGen:` lines empty; a design pass fills them.",
        "- Never invent a capability, claim, artifact or reference. An empty field is",
        "  correct when the source does not support a value.",
        *retry_lines,
        "- You are unattended: nobody will answer a question. Do not run skill workflows.",
    ])


def publish_brief(linear, issue, text: str, retry: bool = False) -> dict:
    """Record this brief run on the issue, once per run kind, and report what is missing.

    The run marker is written even when the agent produced nothing usable, so
    an issue advances to the retry and then to `brief-auto` instead of looping.
    """
    text = (text or "").strip()
    usable = bool(_section_bodies(text))
    description = _description(linear, issue).rstrip()
    marker = BRIEF_RETRY_MARKER if retry else BRIEF_MARKER
    variant = brief_variant(issue)
    if marker in description:  # a stale claim-scan cache; the earlier run stands
        return {"verdict": "brief-incomplete", "reasons": ["brief-already-published"],
                "missing": brief_status(description, variant=variant)["missing"]}
    if retry and usable:
        base = description.split(BRIEF_MARKER, 1)[0].rstrip()
        updated = f"{base}\n\n{BRIEF_MARKER}\n{BRIEF_RETRY_MARKER}\n{text}\n"
    elif retry:
        updated = f"{description}\n{BRIEF_RETRY_MARKER}\n"
    else:
        updated = f"{description}\n\n{BRIEF_MARKER}\n{text}\n"
    _set_description(linear, issue, updated)
    status = brief_status(updated, variant=variant)
    if status["complete"]:
        linear.gql(
            "mutation($id:String!,$label:String!){issueUpdate(id:$id,input:{removedLabelIds:[$label]}){success}}",
            {"id": issue.id, "label": NEEDS_BRIEF_LABEL_ID},
        )
        body = "🤖 design/brief lane: steps 1–9 complete inline. A build lane admits this next."
    else:
        missing = ", ".join(str(step) for step in status["missing"])
        nxt = ("it is admitted as `brief-auto` on the next claim and Tim gets one Ovie decision"
               if retry else "one frontier retry runs on the next claim")
        body = (f"🤖 design/brief lane{' (frontier retry)' if retry else ''}: "
                f"{'drafted the brief inline' if usable else 'produced no usable brief'}. "
                f"Steps {missing} are still missing; {nxt}.")
    linear.comment(issue.id, body)
    return {"verdict": "brief-complete" if status["complete"] else "brief-incomplete",
            "missing": status["missing"], "reasons": [] if usable else ["brief-empty"]}


def enforce_enabled(value: str | None = None) -> bool:
    """`DESIGN_GATE_ENFORCE` blocks CI only when it is truthy. Default off."""
    raw = os.environ.get("DESIGN_GATE_ENFORCE", "") if value is None else value
    return str(raw).strip().lower() in {"1", "true", "yes", "on"}
