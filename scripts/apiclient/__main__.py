"""python3 -m apiclient status [--json]    per-provider budgets, breakers, last-hour usage
python3 -m apiclient gh [--priority P] [--credential ID] -- <gh args>   gh through the ledger (exit 75 = deferred)
"""
from __future__ import annotations

import json
import sys

from .contract import PRIORITIES, PROVIDERS
from .gh import run_gh
from .policy import HOUR_MS, USAGE_FIELDS, live_bucket
from .store import credential_label, default_store, now_ms

STATUS_SCHEMA = "jovie-api-status/v1"


def summarize(ledgers, at: int) -> dict:
    """Same shape as packages/api-client/cli.ts summarize()."""
    providers = {}
    for ledger in ledgers:
        credentials = {}
        for cid, state in ledger["credentials"].items():
            buckets = {}
            for name in list(state["buckets"].keys()):
                b = live_bucket(state, name, at)
                if b:
                    buckets[name] = {"remaining": b["remaining"], "limit": b.get("limit"), "resetAt": b.get("resetAt")}
            usage: dict = {}
            for hour in (at // HOUR_MS, at // HOUR_MS - 1):
                for priority, row in (state["usage"].get(str(hour)) or {}).items():
                    into = usage.setdefault(priority, {f: 0 for f in USAGE_FIELDS})
                    for f in USAGE_FIELDS:
                        into[f] += (row or {}).get(f, 0)
            br = state["breaker"]
            credentials[credential_label(cid)] = {
                "buckets": buckets,
                "breaker": {"state": br["state"], "openUntil": None if br["state"] == "closed" else br["openUntil"],
                            "reason": br["reason"]},
                "usage": usage,
                "lastSeenAt": state["lastSeenAt"],
            }
        if credentials:
            providers[ledger["provider"]] = {"credentials": credentials}
    return {"schema": STATUS_SCHEMA, "observedAt": at, "providers": providers}


def status(store, at=None) -> dict:
    return summarize([store.read(p) for p in PROVIDERS], now_ms() if at is None else at)


def text(summary: dict) -> str:
    lines = []
    for provider, value in summary["providers"].items():
        for cid, c in value["credentials"].items():
            buckets = ", ".join(f"{n} {b['remaining']}/{b['limit'] if b['limit'] is not None else '?'}"
                                for n, b in c["buckets"].items())
            shed = sum(u.get("shed", 0) for u in c["usage"].values())
            lines.append(f"{provider} {cid} breaker={c['breaker']['state']} {buckets or 'no budget observed'} shed/2h={shed}")
    return "\n".join(lines) if lines else "no API usage recorded on this host"


def main(argv=None) -> int:
    argv = sys.argv[1:] if argv is None else argv
    command, rest = (argv[0], argv[1:]) if argv else ("", [])
    if command == "status":
        summary = status(default_store())
        print(json.dumps(summary) if "--json" in rest else text(summary))
        return 0
    if command == "gh" and "--" in rest:
        split = rest.index("--")
        flags = rest[:split]

        def flag(name):
            return flags[flags.index(name) + 1] if name in flags and flags.index(name) + 1 < len(flags) else None

        priority = flag("--priority") or "default"
        if priority not in PRIORITIES:
            sys.stderr.write(f"unknown priority {priority}\n")
            return 2
        result = run_gh(rest[split + 1:], priority=priority, credential=flag("--credential"))
        sys.stdout.write(result["stdout"])
        sys.stderr.write(result["stderr"])
        return result["code"]
    sys.stderr.write("usage: python3 -m apiclient status [--json] | gh [--priority P] -- <gh args>\n")
    return 2


if __name__ == "__main__":
    sys.exit(main())
