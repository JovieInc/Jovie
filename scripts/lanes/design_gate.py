#!/usr/bin/env python3
"""Design gate for Symphony build lanes (JOV-7541).

UI and landing work follows a design brief that completes steps 1–9 of the
founder's IA-first pipeline, citing only certified product-truth capability
ids. Pure stdlib. No I/O at import.

Tim 2026-10-11: no issue waits on another agent or a human for its brief. A
gated issue whose brief is missing or incomplete is admitted as `brief-auto`:
the claiming build run writes its own brief from the template and canon, then
builds in the same run (lane_runner.DESIGN_LOOP_CONTRACT). The open taste call
goes to Tim once as a founder work order and never blocks the build. App-UI
issues use their own steps 5–7 (screens/states, canonical primitives,
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

# Legacy hold label. Nothing adds it any more; a brief-auto claim removes it.
NEEDS_BRIEF_LABEL = "needs-design-brief"
NEEDS_BRIEF_LABEL_ID = "5fa70dd4-2c23-4ed7-a6db-73bf4910b333"

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


def build_admission(issue, linked_doc_text: str | None = None, read_text=None) -> dict:
    """Admit, or admit as `brief-auto` with the missing steps. Never holds.

    `read_text(repo_path)` optionally loads a `docs/design/*.md` link. Ungated
    issues are admitted without reading a brief. An incomplete brief is
    admitted as `brief-auto`: the claiming run writes the brief itself.
    """
    if not is_design_gated(issue):
        return {
            "admit": True, "reason": None, "gated": False, "missing": [],
            "invalidCapabilityIds": [], "source": None, "auto": False, "variant": None,
        }
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
    complete = bool(status["complete"])
    return {
        "admit": True,
        "reason": None if complete else BRIEF_AUTO_REASON,
        "gated": True,
        "missing": status["missing"],
        "invalidCapabilityIds": status["invalidCapabilityIds"],
        "source": status["source"],
        "auto": not complete,
        "variant": variant,
    }


def empty_census() -> dict:
    return {
        "gated": 0,
        "admitted": 0,
        "autoAdmitted": 0,
        "missingSteps": {str(step): 0 for step in BRIEF_STEPS},
    }


def apply_to_pool(qualified_by_provider: dict, read_text=None) -> dict:
    """Count gated work in an already-admitted pool. Nothing is dropped: an incomplete
    brief is `brief-auto` work the claiming run finishes itself. Deduped by identifier;
    `missingSteps` counts the steps the claiming runs will have to write."""
    census = empty_census()
    seen: set[str] = set()
    for issues in qualified_by_provider.values():
        for issue in issues:
            key = getattr(issue, "identifier", None) or str(id(issue))
            if key in seen:
                continue
            seen.add(key)
            decision = build_admission(issue, read_text=read_text)
            if decision["gated"]:
                census["gated"] += 1
                census["admitted"] += 1
                census["autoAdmitted"] += int(decision["auto"])
                for step in decision["missing"]:
                    census["missingSteps"][str(step)] += 1
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
                    "of its design brief were missing at claim, so the build run wrote its own "
                    "brief from canon and shipped it as brief-auto."),
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
            "whyNow": "No build waits on a brief, so this shipped from a brief the build run wrote.",
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
    """Label `brief-auto`, warn, and file the founder taste decision once. Clears the
    legacy `needs-design-brief` hold label if an older harness added it."""
    if NEEDS_BRIEF_LABEL in _labels(issue):
        linear.gql(
            "mutation($id:String!,$label:String!){issueUpdate(id:$id,input:{removedLabelIds:[$label]}){success}}",
            {"id": issue.id, "label": NEEDS_BRIEF_LABEL_ID},
        )
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
        f"⚠️ design gate: brief-auto. Claimed with brief steps {missing} incomplete; this run "
        "writes the brief from the template and canon, then builds it inside the existing "
        "guardrails. The taste call goes to Tim as one Ovie decision after the fact "
        f"(work order `{order['orderId']}`).",
    )
    return True


def pick_build_issue(issues, failures, *, pick, linear=None, repo=None,
                     now=None, in_flight=frozenset(), provider=None):
    """The build-lane admission wrapper around `pick`. Never waits on a brief.

    `pick`'s own order and eligibility choose the issue. A gated issue whose brief is
    incomplete is claimed as `brief-auto` (labeled and filed for the founder once); the
    claiming run writes the brief and builds in the same run.
    """
    chosen = pick(issues, failures, now=now, in_flight=in_flight, provider=provider)
    if chosen is None or linear is None:
        return chosen
    decision = build_admission(chosen, read_text=repo_reader(repo))
    if decision["auto"]:
        try:
            ensure_brief_auto(linear, chosen, decision, now=now)
        except Exception as error:
            sys.stderr.write(f"brief-auto record skipped: {type(error).__name__}: {error}\n")
    return chosen


def enforce_enabled(value: str | None = None) -> bool:
    """`DESIGN_GATE_ENFORCE` blocks CI only when it is truthy. Default off."""
    raw = os.environ.get("DESIGN_GATE_ENFORCE", "") if value is None else value
    return str(raw).strip().lower() in {"1", "true", "yes", "on"}
