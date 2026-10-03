#!/usr/bin/env python3
"""Per-issue Symphony dequeue router (symphony-dispatches-hyperagent-v1).

Symphony DISPATCHES matching jobs to Hyperagent. HA does not poll a
Linear/GitHub `hyperagent` tag. That label is Tim/Ops OVERRIDE only.
Concurrency is GLOBAL, not per-model. Native MQ only.
"""
from __future__ import annotations

import json
import sys

HA_OVERRIDE_LABEL = "hyperagent"
HA_JOB_TYPES = (
    "optical-grid",
    "ui-cert",
    "design-domain",
    "lyb-ios-refactor",
    "fable-closed-loop",
)
# CI-repair/remediator is sidecar Grok/Kimi, not HA.
_REMEDIATOR_TOKENS = (
    "remediator",
    "ci-repair",
    "ci repair",
    "fix(ci)",
    "failing ci",
    "github-ci-failure",
    "remount_ci",
    "isolated-pr-repair",
)
SHIP_AGENT = {
    "id": "cmr2jopzc03xd07ady1mk0kab",
    "name": "Fable Developer",
    "model": "fable-5.1",
    "alt_model": "glm-5.3",
}

_DESIGN_LABELS = frozenset({
    "design-system",
    "design-domain",
    "stream:ux-0-drift",
    "ui-cert",
    "ui-certification",
})
_OPTICAL_TOKENS = (
    "optical-grid",
    "optical grid",
    "0-drift",
    "ux-0-drift",
    "spacing-scale-ratchet",
    "shrink-only ratchet",
)
_UI_CERT_TOKENS = (
    "ui-cert",
    "ui cert",
    "ui certification",
    "certify canonical",
)
_LYB_IOS_TOKENS = (
    "lyb-ios-refactor",
    "logyourbody ios",
    "lyb ios refactor",
)
_FABLE_LOOP_TOKENS = (
    "fable closed-loop",
    "fable closed loop",
    "closed-loop fable",
)


def _norm_labels(labels) -> set[str]:
    out = set()
    if isinstance(labels, dict):
        nodes = labels.get("nodes") or []
        labels = [n.get("name") for n in nodes if isinstance(n, dict)]
    if not isinstance(labels, (list, set, tuple)):
        return out
    for item in labels:
        if isinstance(item, dict):
            item = item.get("name")
        if isinstance(item, str) and item.strip():
            out.add(item.strip().lower())
    return out


def _blob(issue: dict) -> str:
    title = issue.get("title") if isinstance(issue.get("title"), str) else ""
    desc = issue.get("description") if isinstance(issue.get("description"), str) else ""
    ident = issue.get("identifier") or issue.get("id") or ""
    return f"{ident}\n{title}\n{desc}".lower()


def classify_job_type(issue: dict) -> str | None:
    labels = _norm_labels(issue.get("labels"))
    if HA_OVERRIDE_LABEL in labels:
        return "override"
    blob = _blob(issue)
    ident = str(issue.get("identifier") or issue.get("id") or "").upper()
    if any(tok in blob for tok in _REMEDIATOR_TOKENS) or "area:ci" in labels:
        return "remediator"
    if any(tok in blob for tok in _OPTICAL_TOKENS) or "stream:ux-0-drift" in labels:
        return "optical-grid"
    if any(tok in blob for tok in _UI_CERT_TOKENS):
        return "ui-cert"
    if any(tok in blob for tok in _LYB_IOS_TOKENS) or (
        ident.startswith("LYB-") and "ios" in blob and "refactor" in blob
    ):
        return "lyb-ios-refactor"
    if any(tok in blob for tok in _FABLE_LOOP_TOKENS):
        return "fable-closed-loop"
    if labels & _DESIGN_LABELS or "design-domain" in blob:
        return "design-domain"
    return None


def choose_route(
    issue: dict,
    *,
    leftover_spark: bool = False,
    leftover_spark_usable: bool = False,
    included_codex_empty: bool = True,
    grok_open: bool = True,
    kimi_open: bool = True,
) -> dict:
    """Return a route document. Never idle waiting for a human model switch.

    leftover spark only if remaining AND usable (not usageLimitExceeded).
    Otherwise grok/kimi. Codex app-server is not a Grok drop-in.
    """
    ident = str(issue.get("identifier") or issue.get("id") or "")
    labels = _norm_labels(issue.get("labels"))
    job_type = classify_job_type(issue)
    override = HA_OVERRIDE_LABEL in labels
    ha_match = override or job_type in HA_JOB_TYPES
    if ha_match:
        return {
            "schema": "symphony-dispatches-hyperagent-v1",
            "identifier": ident,
            "target": "ha",
            "agent_id": SHIP_AGENT["id"],
            "agent_name": SHIP_AGENT["name"],
            "model": SHIP_AGENT["model"],
            "job_type": job_type or "override",
            "reason": "override_label_hyperagent" if override else f"job_type:{job_type}",
            "poll_tag": False,
            "nova": False,
            "remediator": False,
        }
    if leftover_spark and leftover_spark_usable and included_codex_empty:
        return {
            "schema": "symphony-dispatches-hyperagent-v1",
            "identifier": ident,
            "target": "leftover-spark",
            "model": "gpt-5.3-codex-spark",
            "job_type": job_type,
            "reason": "included_codex_empty leftover_spark",
            "poll_tag": False,
        }
    if leftover_spark and leftover_spark_usable and not included_codex_empty:
        return {
            "schema": "symphony-dispatches-hyperagent-v1",
            "identifier": ident,
            "target": "included-codex",
            "job_type": job_type,
            "reason": "included_codex_remaining",
            "poll_tag": False,
        }
    if grok_open and kimi_open:
        pick_kimi = bool(ident) and (sum(ord(ch) for ch in ident) % 2 == 1)
        if pick_kimi:
            return {
                "schema": "symphony-dispatches-hyperagent-v1",
                "identifier": ident,
                "target": "kimi",
                "model": "kimi-k3",
                "job_type": job_type,
                "reason": "best_available_kimi_split",
                "poll_tag": False,
            }
        return {
            "schema": "symphony-dispatches-hyperagent-v1",
            "identifier": ident,
            "target": "grok",
            "model": "grok-4.6",
            "job_type": job_type,
            "reason": "best_available_grok_split",
            "poll_tag": False,
        }
    if grok_open:
        return {
            "schema": "symphony-dispatches-hyperagent-v1",
            "identifier": ident,
            "target": "grok",
            "model": "grok-4.6",
            "job_type": job_type,
            "reason": "best_available_grok",
            "poll_tag": False,
        }
    if kimi_open:
        return {
            "schema": "symphony-dispatches-hyperagent-v1",
            "identifier": ident,
            "target": "kimi",
            "model": "kimi-k3",
            "job_type": job_type,
            "reason": "best_available_kimi",
            "poll_tag": False,
        }
    return {
        "schema": "symphony-dispatches-hyperagent-v1",
        "identifier": ident,
        "target": "grok",
        "model": "grok-4.6",
        "job_type": job_type,
        "reason": "never_idle_default_grok",
        "poll_tag": False,
    }


def main() -> int:
    raw = sys.stdin.read() if not sys.argv[1:] else ""
    if raw.strip():
        issues = json.loads(raw)
        if isinstance(issues, dict):
            issues = [issues]
    else:
        issues = [json.loads(arg) for arg in sys.argv[1:]]
    out = [choose_route(issue) for issue in issues]
    json.dump(out if len(out) != 1 else out[0], sys.stdout, indent=2)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
