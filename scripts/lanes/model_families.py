#!/usr/bin/env python3
"""Model families: the one place a concrete OpenAI model id lives (ops/registry/capacity.json, `modelFamilies`).

A family (`openai:sol`) names a tier. Its `latest` member is the newest id that is available on every path in
`requiredPaths` (Tim's standing preference: latest available on the OpenAI subscription seats, which get cheaper
and more efficient each round). Everything else reads an alias such as `openai:sol@latest` or follows the
rows `apply()` keeps in step: the capacity pricing paths and the codex-* entries of the lane model registry.

    model_families.py resolve openai:sol@latest   print the concrete id
    model_families.py check                       fail when any consumer row disagrees with `latest`
    model_families.py sync [--write]              observe provider lists, move aliases, report events
    model_families.py stale                       fail when the registry is >7 days behind a provider list

Evidence (no spend, no key): the Vercel AI Gateway public catalog proves the `api` path with list prices; the
Codex model catalog (`models_cache.json`, written by the Codex client) proves the `subscription` path. Reading
that cache is not driving a consumer CLI. A source that is missing gives no evidence and removes nothing.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE))
from atomic_state import atomic_write_text  # noqa: E402
CAPACITY_PATH = ROOT / "ops/registry/capacity.json"
MODEL_REGISTRY_PATH = ROOT / "scripts/backlog-orchestrator/config/model-registry.json"
PROVIDERS_PATH = ROOT / "packages/api-client/providers.json"
CODEX_CACHE = Path.home() / ".codex/models_cache.json"
SCHEMA = "jovie.model-families/v1"
DAY = 86400


class FamilyError(ValueError):
    pass


def _now_iso(now: float) -> str:
    return datetime.fromtimestamp(now, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _epoch(value) -> float | None:
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")).timestamp()
    except ValueError:
        return None


def section(capacity: dict) -> dict:
    found = capacity.get("modelFamilies")
    if not isinstance(found, dict) or found.get("schema") != SCHEMA:
        raise FamilyError(f"capacity.json modelFamilies must declare schema {SCHEMA}")
    return found


def version(family: dict, model_id: str) -> tuple | None:
    """Numeric version of an id that exactly matches the family pattern (variants like -fast do not match)."""
    match = re.fullmatch(family["idPattern"], model_id)
    return tuple(int(p) for p in match.group(1).split(".")) if match else None


def parse_alias(alias: str) -> tuple[str, str]:
    key, _, selector = alias.partition("@")
    if not key or not key.count(":") == 1:
        raise FamilyError(f"alias must look like provider:family@latest, got {alias!r}")
    return key, selector or "latest"


def resolve(capacity: dict, alias: str) -> str:
    key, selector = parse_alias(alias)
    families = section(capacity)["families"]
    if key not in families:
        raise FamilyError(f"unknown family {key}")
    if selector == "latest":
        return families[key]["latest"]
    if any(m["id"] == selector for m in families[key]["members"]):
        return selector
    raise FamilyError(f"{alias}: {selector} is not a member of {key}")


def _available(family: dict, member: dict) -> bool:
    return all(path in member.get("paths", []) for path in family["requiredPaths"])


def newest_available(family: dict) -> dict | None:
    ranked = [(version(family, m["id"]), m) for m in family["members"] if _available(family, m)]
    ranked = [(v, m) for v, m in ranked if v]
    return max(ranked, key=lambda pair: pair[0])[1] if ranked else None


def observe(capacity: dict, evidence: dict, now: float) -> list[dict]:
    """Fold provider lists into the members. `evidence` is {path: set of ids | None, prices: {id: {in, out}}}.
    New ids are recorded as available (status `available`); a path whose source gave no list (None) changes nothing."""
    events, stamp = [], _now_iso(now)
    prices = evidence.get("prices") or {}
    for key, family in section(capacity)["families"].items():
        known = {m["id"]: m for m in family["members"]}
        seen: dict[str, set] = {}
        for path in ("api", "subscription"):
            ids = evidence.get(path)
            if ids is None:
                continue
            for model_id in ids:
                if version(family, model_id):
                    seen.setdefault(model_id, set()).add(path)
        for model_id, paths in sorted(seen.items()):
            member = known.get(model_id)
            if member is None:
                member = {"id": model_id, "firstSeen": stamp, "paths": []}
                family["members"].append(member)
                events.append({"type": "new", "family": key, "id": model_id, "paths": sorted(paths)})
            for path in sorted(paths):
                if path not in member["paths"]:
                    member["paths"].append(path)
                    if member["firstSeen"] != stamp:
                        events.append({"type": "path-added", "family": key, "id": model_id, "path": path})
            if model_id in prices:
                new = {"in": prices[model_id]["in"], "out": prices[model_id]["out"]}
                if member.get("listPrice") != new:
                    member["listPrice"] = new
    section(capacity)["syncedAt"] = stamp
    return events


def move_aliases(capacity: dict, now: float) -> list[dict]:
    """Move each family's `latest` to the newest member available on all required paths. Newer only, never back."""
    moves = []
    for key, family in section(capacity)["families"].items():
        best = newest_available(family)
        if not best or best["id"] == family["latest"]:
            continue
        if (version(family, best["id"]) or ()) <= (version(family, family["latest"]) or ()):
            continue
        moves.append({"type": "alias-move", "family": key, "from": family["latest"], "to": best["id"]})
        family["latest"] = best["id"]
        family["latestSince"] = _now_iso(now)
    return moves


def stale(capacity: dict, now: float) -> list[dict]:
    """Alarms: a provider-listed id newer than `latest` that has waited past the limit (or never moved because it is
    missing a required path), or a registry not synced within the limit."""
    meta = section(capacity)
    limit = float(meta.get("staleAlarmDays", 7)) * DAY
    alarms = []
    synced = _epoch(meta.get("syncedAt"))
    if synced is None or now - synced > limit:
        alarms.append({"type": "sync-overdue", "syncedAt": meta.get("syncedAt")})
    for key, family in meta["families"].items():
        current = version(family, family["latest"]) or ()
        for member in family["members"]:
            v = version(family, member["id"])
            first = _epoch(member.get("firstSeen"))
            if v and v > current and first is not None and now - first > limit:
                alarms.append({"type": "behind-provider", "family": key, "latest": family["latest"], "newer": member["id"],
                               "paths": member["paths"], "missing": [p for p in family["requiredPaths"] if p not in member["paths"]],
                               "firstSeen": member["firstSeen"]})
    return alarms


# --- consumers: text-preserving rewrite (the JSON files are hand-formatted) -------------------------

def _num(value: float) -> str:
    return repr(float(value)) if float(value) != int(value) else f"{float(value):.1f}"


def apply_text(capacity: dict, capacity_text: str, models_text: str) -> tuple[str, str]:
    """Rewrite the concrete ids in the capacity pricing paths and the lane model registry to each family's `latest`."""
    meta = section(capacity)
    families = meta["families"]
    for key, family in families.items():
        latest = family["latest"]
        member = next(m for m in family["members"] if m["id"] == latest)
        for path in capacity.get("pricing", {}).get("paths", []):
            if path.get("family") != key or path["model"] == latest:
                continue
            old = path["model"]
            capacity_text = capacity_text.replace(f'"id": "{old}@', f'"id": "{latest}@').replace(f'"model": "{old}"', f'"model": "{latest}"')
        for registry_id in family.get("registryIds", []):
            start = models_text.find(f'"id": "{registry_id}"')
            if start < 0:
                raise FamilyError(f"{registry_id} is not in the lane model registry")
            end = models_text.find('"id":', start + 10)
            stop = end if end > 0 else len(models_text)
            block = models_text[start:stop]
            block = re.sub(r'("model": ")[^"]*(")', rf"\g<1>{latest}\2", block, count=1)
            block = re.sub(r'("family": ")[^"]*(")', rf"\g<1>{_generation(latest)}\2", block, count=1)
            price = member.get("listPrice")
            if price:
                block = re.sub(r'("list_price_in": )[0-9.]+', rf"\g<1>{_num(price['in'])}", block, count=1)
                block = re.sub(r'("list_price_out": )[0-9.]+', rf"\g<1>{_num(price['out'])}", block, count=1)
            models_text = models_text[:start] + block + models_text[stop:]
    return capacity_text, models_text


def _generation(model_id: str) -> str:
    """gpt-6.1-sol -> gpt-6.1 (the lane registry's `family` field)."""
    return re.sub(r"-(luna|terra|sol|astra)$", "", model_id)


def drift(capacity: dict, models: dict) -> list[str]:
    """Every consumer row must carry its family's `latest`."""
    errors = []
    by_id = {m.get("id"): m for m in models.get("models", [])}
    for key, family in section(capacity)["families"].items():
        latest = family["latest"]
        member = next((m for m in family["members"] if m["id"] == latest), None)
        if member is None or not _available(family, member):
            errors.append(f"{key}: latest {latest} is not available on {family['requiredPaths']}")
        if (newest := newest_available(family)) and newest["id"] != latest and (version(family, newest["id"]) or ()) > (version(family, latest) or ()):
            errors.append(f"{key}: {newest['id']} is available and newer than latest {latest}; run sync --write")
        for path in capacity.get("pricing", {}).get("paths", []):
            if path.get("family") == key and (path["model"] != latest or not path["id"].startswith(latest + "@")):
                errors.append(f"pricing path {path['id']} is not {latest}")
        for registry_id in family.get("registryIds", []):
            entry = by_id.get(registry_id)
            if not entry or entry.get("model") != latest:
                errors.append(f"model-registry {registry_id} model is {(entry or {}).get('model')}, expected {latest}")
            elif member and member.get("listPrice") and (entry.get("list_price_in"), entry.get("list_price_out")) != (member["listPrice"]["in"], member["listPrice"]["out"]):
                errors.append(f"model-registry {registry_id} list price differs from the {latest} member price")
    for path in capacity.get("pricing", {}).get("paths", []):
        if path.get("family") and path["family"] not in section(capacity)["families"]:
            errors.append(f"pricing path {path['id']} names unknown family {path['family']}")
    return errors


# --- evidence ---------------------------------------------------------------------------------------

def gateway_evidence(doc: dict, prefix: str = "openai/") -> tuple[set, dict]:
    ids, prices = set(), {}
    for row in doc.get("data", []):
        model_id = str(row.get("id", ""))
        if not model_id.startswith(prefix):
            continue
        bare = model_id[len(prefix):]
        ids.add(bare)
        pricing = row.get("pricing") or {}
        try:
            prices[bare] = {"in": round(float(pricing["input"]) * 1e6, 6), "out": round(float(pricing["output"]) * 1e6, 6)}
        except (KeyError, TypeError, ValueError):
            pass
    return ids, prices


def codex_evidence(doc: dict) -> set:
    """Listed (visible) Codex models; hidden helper models are not seats a lane may choose."""
    return {m["slug"] for m in doc.get("models", []) if m.get("visibility") == "list" and m.get("slug")}


def fetch_gateway() -> dict:
    sys.path.insert(0, str(HERE.parent))
    from apiclient import ApiClient  # the one client layer; the Gateway catalog is public, so the credential is empty-labelled
    host = json.loads(PROVIDERS_PATH.read_text())["providers"]["ai-gateway"]["hosts"][0]  # host comes from the one provider registry
    return ApiClient("ai-gateway", "public-catalog").request(f"https://{host}/v1/models", priority="poll").json()


def read_codex(path: Path = CODEX_CACHE) -> dict | None:
    try:
        return json.loads(path.read_text())
    except (OSError, ValueError):
        return None


def collect(gateway_doc: dict | None, codex_doc: dict | None) -> dict:
    evidence: dict = {"api": None, "subscription": None, "prices": {}}
    if gateway_doc:
        evidence["api"], evidence["prices"] = gateway_evidence(gateway_doc)
    if codex_doc:
        evidence["subscription"] = codex_evidence(codex_doc)
    return evidence


def sync(capacity_text: str, models_text: str, evidence: dict, now: float) -> dict:
    capacity = json.loads(capacity_text)
    events = observe(capacity, evidence, now)
    moves = move_aliases(capacity, now)
    new_capacity_text = _merge_section(capacity_text, capacity)
    new_capacity_text, new_models_text = apply_text(capacity, new_capacity_text, models_text)
    return {"events": events, "moves": moves, "capacityText": new_capacity_text, "modelsText": new_models_text,
            "alarms": stale(capacity, now), "changed": new_capacity_text != capacity_text or new_models_text != models_text}


def _compact(text: str) -> str:
    """Join short scalar arrays onto one line, as the repo formatter (biome) prints them (80 columns)."""
    def join(match: re.Match) -> str:
        items = [i.strip() for i in match.group(2).split(",\n")]
        line = f"{match.group(1)}[{', '.join(items)}]"
        return line if len(line) <= 79 else match.group(0)
    return re.sub(r'(?m)^( *"[^"\n]+": )\[\n((?: +(?:"[^"\n]*"|-?[0-9.]+),?\n)+) *\](,?)', lambda m: join(m) + m.group(3), text)


def _merge_section(text: str, capacity: dict) -> str:
    """Replace the `modelFamilies` object in the file text; the rest of the hand formatting is untouched."""
    start = text.index('"modelFamilies"')
    open_at = text.index("{", start)
    depth, i = 0, open_at
    while True:
        depth += {"{": 1, "}": -1}.get(text[i], 0)
        if depth == 0:
            break
        i += 1
    body = _compact(json.dumps(section(capacity), indent=2).replace("\n", "\n  "))
    return text[:open_at] + body + text[i + 1:]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    sub = parser.add_subparsers(dest="cmd", required=True)
    sub.add_parser("check")
    sub.add_parser("stale")
    r = sub.add_parser("resolve")
    r.add_argument("alias")
    s = sub.add_parser("sync")
    s.add_argument("--write", action="store_true")
    s.add_argument("--codex-cache", default=str(CODEX_CACHE))
    s.add_argument("--gateway-file", help="read a saved Gateway catalog instead of fetching")
    args = parser.parse_args(argv)
    capacity_text, models_text = CAPACITY_PATH.read_text(), MODEL_REGISTRY_PATH.read_text()
    capacity = json.loads(capacity_text)
    now = time.time()
    if args.cmd == "resolve":
        print(resolve(capacity, args.alias))
        return 0
    if args.cmd == "check":
        errors = drift(capacity, json.loads(models_text))
        print(json.dumps({"ok": not errors, "errors": errors}, indent=2))
        return 1 if errors else 0
    if args.cmd == "stale":
        alarms = stale(capacity, now)
        print(json.dumps({"ok": not alarms, "alarms": alarms}, indent=2))
        return 1 if alarms else 0
    gateway = json.loads(Path(args.gateway_file).read_text()) if args.gateway_file else None
    if gateway is None:
        try:
            gateway = fetch_gateway()
        except Exception as error:  # a dead source gives no evidence and removes nothing
            print(json.dumps({"source": "gateway", "failed": type(error).__name__}), file=sys.stderr)
    result = sync(capacity_text, models_text, collect(gateway, read_codex(Path(args.codex_cache))), now)
    if args.write and result["changed"]:
        atomic_write_text(CAPACITY_PATH, result["capacityText"])
        atomic_write_text(MODEL_REGISTRY_PATH, result["modelsText"])
    print(json.dumps({k: result[k] for k in ("events", "moves", "alarms", "changed")}, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
