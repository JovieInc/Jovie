#!/usr/bin/env python3
"""Factory intake: fleet-improvement signals become agent-ready Linear issues.

Anything that notices a problem in the factory itself (sentinel alarm, outcome-gaps.json, cheap-fixer
handoff, flaky/red-check class, the factory-audit synthesis, rework rate) drops one
`jovie-factory-signal/v1` JSON file into `<state>/factory-signals/`:

    {"schema": "jovie-factory-signal/v1", "fingerprint": "run-waste-fix-no-change", "source": "ledger",
     "title": "...", "problem": "...", "acceptance": ["..."],
     "metric": {"name": "fix-no-change share of runs", "baseline": 0.18, "target": 0.09,
                "measuredBy": "fleet_ledger.py metrics"}}

`plan` turns each into an issue body with a Goal, Definition of done and a Verification section
naming the fleet metric that must move (a factory change counts only when it does). `apply` files
the ones with no open issue carrying the label `factory-fp:<fingerprint>` in Todo with labels
`factory` and `ws:symphony-throughput`, so the existing lanes admission (workstream rank) runs
them like any other issue. The doctor pass files them (run_pass); the CLI only prints the plan. Dedupe is the label, like remediation:<fp>.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path

SCHEMA = "jovie-factory-signal/v1"
FP = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
WORKSTREAM_LABEL = "ws:symphony-throughput"
FACTORY_LABEL = "factory"
MAX_PER_PASS = 3          # a pass never floods the pool; the rest wait for the next pass


def read_signals(directory: Path) -> tuple[list[dict], list[str]]:
    good, bad = [], []
    for path in sorted(directory.glob("*.json")):
        try:
            row = json.loads(path.read_text())
        except (OSError, ValueError):
            bad.append(f"{path.name}: unreadable")
            continue
        problem = validate(row)
        (bad.append(f"{path.name}: {problem}") if problem else good.append(row))
    return good, bad


def validate(row) -> str | None:
    if not isinstance(row, dict) or row.get("schema") != SCHEMA:
        return "wrong schema"
    if not FP.match(str(row.get("fingerprint") or "")):
        return "fingerprint must be a lowercase slug"
    if not str(row.get("title") or "").strip() or not str(row.get("problem") or "").strip():
        return "title and problem are required"
    acceptance = row.get("acceptance")
    if not isinstance(acceptance, list) or not [a for a in acceptance if str(a).strip()]:
        return "acceptance criteria are required (an issue an agent cannot verify is not agent-ready)"
    metric = row.get("metric")
    if not isinstance(metric, dict) or not metric.get("name") or metric.get("target") is None:
        return "metric {name, target} is required: a factory change counts only when a fleet metric moves"
    return None


def label(fingerprint: str) -> str:
    return f"factory-fp:{fingerprint}"


def body(row: dict) -> str:
    metric = row["metric"]
    lines = ["## Goal", str(row["problem"]).strip(), "", "## Definition of done",
             *[f"- {str(item).strip()}" for item in row["acceptance"] if str(item).strip()], "",
             "## Verification (measured)",
             f"- Metric: {metric['name']}; baseline {metric.get('baseline', 'unmeasured')}, target {metric['target']}.",
             f"- Measured by: {metric.get('measuredBy', 'fleet_ledger.py metrics')} before and after the change lands "
             "on the install; the issue is Done only when the metric moved, not when the PR merged.", "",
             f"Factory work (signal source `{row.get('source', 'unknown')}`, fingerprint `{row['fingerprint']}`); "
             "filed by scripts/lanes/factory_intake.py."]
    return "\n".join(lines)


def plan(signals: list[dict]) -> list[dict]:
    return [{"fingerprint": row["fingerprint"], "title": str(row["title"]).strip()[:200], "description": body(row),
             "labels": [FACTORY_LABEL, WORKSTREAM_LABEL, label(row["fingerprint"])]} for row in signals]


EXISTING = ('query($l:String!){issues(first:1,filter:{team:{key:{eq:"JOV"}},labels:{name:{eq:$l}},'
            'state:{type:{nin:["completed","canceled"]}}}){nodes{id identifier}}}')
TEAM = ('query{teams(filter:{key:{eq:"JOV"}}){nodes{id states{nodes{id name}} labels(first:250){nodes{id name}}}}}')
CREATE = 'mutation($i:IssueCreateInput!){issueCreate(input:$i){success issue{id identifier}}}'
LABEL_CREATE = 'mutation($i:IssueLabelCreateInput!){issueLabelCreate(input:$i){success issueLabel{id name}}}'


def apply(linear, items: list[dict], limit: int = MAX_PER_PASS) -> list[dict]:
    """File items with no open issue under their fingerprint label. Returns what was filed/skipped."""
    team = linear.gql(TEAM, {})["teams"]["nodes"][0]
    todo = next(s["id"] for s in team["states"]["nodes"] if s["name"] == "Todo")
    labels = {l["name"]: l["id"] for l in team["labels"]["nodes"]}
    results = []
    filed = 0
    for item in items:
        fp_label = item["labels"][-1]
        found = linear.gql(EXISTING, {"l": fp_label})["issues"]["nodes"]
        if found:
            results.append({"fingerprint": item["fingerprint"], "action": "exists", "issue": found[0]["identifier"]})
            continue
        if filed >= limit:
            results.append({"fingerprint": item["fingerprint"], "action": "deferred"})
            continue
        ids = []
        for name in item["labels"]:
            if name not in labels:
                made = linear.gql(LABEL_CREATE, {"i": {"teamId": team["id"], "name": name}})["issueLabelCreate"]
                labels[name] = made["issueLabel"]["id"]
            ids.append(labels[name])
        data = linear.gql(CREATE, {"i": {"teamId": team["id"], "stateId": todo, "labelIds": ids, "priority": 2,
                                         "title": item["title"], "description": item["description"]}})
        created = data["issueCreate"]
        if created.get("success") is not True or not (created.get("issue") or {}).get("identifier"):
            raise RuntimeError("linear: factory issue readback mismatch")
        filed += 1
        results.append({"fingerprint": item["fingerprint"], "action": "filed", "issue": created["issue"]["identifier"]})
    return results


def run_pass(state: Path, linear) -> dict:
    """Doctor hook: file pending signals (bounded), never raising into the doctor."""
    try:
        signals, bad = read_signals(state / "factory-signals")
        results = apply(linear, plan(signals)) if signals else []
        return {"signals": len(signals), "invalid": bad[:5], "results": results}
    except Exception as error:  # Linear down or a malformed reply: the next pass retries
        return {"error": f"{type(error).__name__}: {error}"[:200]}


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--state", default=os.environ.get("LANES_STATE") or str(Path.home() / ".local/state/jovie-lanes"))
    args = parser.parse_args(argv)
    signals, bad = read_signals(Path(args.state) / "factory-signals")
    print(json.dumps({"signals": len(signals), "invalid": bad, "plan": plan(signals)}, indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main())
