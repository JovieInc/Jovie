"""Publish a measured pin or workflow-job-gate Win without a model.

pin_revisions fails closed before claim_route, so a non-pin head still reaches
the model unless the diff is only a new vars.NAME == 'true' job gate. A body
edit returns infra-rerun:measured-win. An unchanged body returns None and the
model runs this tick.
"""
from __future__ import annotations

import base64
import json
import re

import repair_win

_WIN_ERROR = re.compile(r"##\[error\]win:")
_MEASURED_WIN = re.compile(r"needs a measured win \(metric, before, after, method, evidence\)")
_PROCESS_ERROR = re.compile(r"##\[error\]Process completed with exit code \d+\.?\s*\Z")

ACTION = "repair-win"
_READ_ERRORS = (ValueError, json.JSONDecodeError, OSError, TypeError, KeyError, AttributeError)


def _shell(sh):
    if sh is not None:
        return sh
    import pr_events
    return pr_events.api_gh


def flatten_files(payload):
    if not isinstance(payload, list):
        raise ValueError("pull files response must be a list")
    if payload and isinstance(payload[0], list):
        if not all(isinstance(page, list) for page in payload):
            raise ValueError("pull files response must be a list")
        return [item for page in payload for item in page]
    return payload


def _read_json(sh, args):
    done = sh(args)
    if getattr(done, "returncode", 1) != 0:
        raise OSError("github read failed")
    return json.loads(done.stdout or "")


def read_files(pr, sh):
    number = pr.get("number") if isinstance(pr, dict) else None
    if type(number) is not int or number < 1:
        raise ValueError("measured win requires a pull request number")
    import pr_events
    payload = _read_json(sh, [
        "api", "--paginate", "--slurp",
        f"repos/{pr_events.REPO}/pulls/{number}/files?per_page=100"])
    return flatten_files(payload)


def _pin_target(files):
    try:
        old, new, cert_old = repair_win.pin_revisions(files)
        return "pin", "JovieInc/ci", old, new, cert_old
    except ValueError:
        pass
    try:
        repository, old, new = repair_win.github_action_revisions(files)
        return "action", repository, old, new, None
    except ValueError:
        return None


def _pin_section(files, sh, target):
    kind, repository, old, new, cert_old = target
    comparison = _read_json(sh, ["api", f"repos/{repository}/compare/{old}...{new}"])
    adopted = _read_json(sh, ["api", f"repos/{repository}/compare/{new}...{new}"])
    if kind == "action":
        return repair_win.github_action_pin(files, comparison, adopted_comparison=adopted)
    kwargs = {}
    if cert_old is not None:
        kwargs["certification_comparison"] = _read_json(
            sh, ["api", f"repos/JovieInc/ci/compare/{cert_old}...{new}"])
        kwargs["certification_adopted"] = _read_json(
            sh, ["api", f"repos/JovieInc/ci/compare/{new}...{new}"])
    return repair_win.company_guard_pin(files, comparison, adopted_comparison=adopted, **kwargs)


def _text_at(sh, sha, path):
    if not isinstance(sha, str) or not re.fullmatch(r"[0-9a-f]{40}", sha):
        raise ValueError("measured win diff is not a pin bump")
    import pr_events
    payload = _read_json(sh, ["api", f"repos/{pr_events.REPO}/contents/{path}?ref={sha}"])
    if (not isinstance(payload, dict) or payload.get("encoding") != "base64"
            or not isinstance(payload.get("content"), str)):
        raise ValueError("workflow contents unavailable")
    return base64.b64decode(payload["content"]).decode()


def _workflow_section(files, sh, pr):
    path = repair_win.workflow_gate_path(files)
    number = pr.get("number") if isinstance(pr, dict) else None
    if type(number) is not int or number < 1:
        raise ValueError("measured win diff is not a pin bump")
    import pr_events
    pull = _read_json(sh, ["api", f"repos/{pr_events.REPO}/pulls/{number}"])
    base = (pull.get("base") or {}).get("sha") if isinstance(pull.get("base"), dict) else None
    head = (pull.get("head") or {}).get("sha") if isinstance(pull.get("head"), dict) else None
    return repair_win.workflow_job_gate(
        _text_at(sh, base, path), _text_at(sh, head, path), before_sha=base, after_sha=head, path=path)


def section_for(files, sh, pr=None) -> str:
    target = _pin_target(files)
    if target is not None:
        return _pin_section(files, sh, target)
    return _workflow_section(files, sh, pr)


def annotated_win_hit(text, hit):
    """Keep an annotated win on the model until every failing check is that win alone."""
    if hit and hit[0] == "fleet-body" and _WIN_ERROR.search(text or ""):
        return ("fleet-body", "agent")
    return hit


def _sole_measured_win(text):
    if not _MEASURED_WIN.search(text or ""):
        return False
    payloads = []
    for line in (text or "").splitlines():
        index = line.find("##[error]")
        if index >= 0:
            payloads.append(line[index:].rstrip())
    if not any(item.startswith("##[error]win:") for item in payloads):
        return False
    return all(item.startswith("##[error]win:") or _PROCESS_ERROR.fullmatch(item) for item in payloads)


def promote_sole_win(per_check, names, logs):
    """Route only when every failing check is a sole annotated measured-win log."""
    if not per_check or any(item != ("fleet-body", "agent") for item in per_check):
        return per_check
    if not all(_sole_measured_win((logs or {}).get(name) or "") for name in names):
        return per_check
    return [("measured-win", "repair-win") for _ in per_check]


def publish(pr, sh) -> bool:
    """Fetch the pin or job-gate evidence and write the Win. False when the edit does not land."""
    try:
        section = section_for(read_files(pr, sh), sh, pr)
    except _READ_ERRORS:
        return False
    import pr_events
    try:
        return bool(pr_events.ensure_red_before_green(
            pr, win_section=section, customer_decision={"releaseWorthy": False}, sh=sh))
    except _READ_ERRORS:
        return False


def apply(host, pr, claim_route, sh=None) -> str | None:
    """Claim once after the diff is measurable. None leaves the head on the model."""
    shell = _shell(sh)
    try:
        files = read_files(pr, shell)
        preview = None if _pin_target(files) is not None else section_for(files, shell, pr)
    except _READ_ERRORS:
        return None
    if not claim_route(host, pr, ACTION):
        return None
    try:
        section = preview if preview is not None else section_for(files, shell, pr)
        import pr_events
        edited = pr_events.ensure_red_before_green(
            pr, win_section=section, customer_decision={"releaseWorthy": False}, sh=shell)
    except _READ_ERRORS:
        return None
    return "infra-rerun:measured-win" if edited else None


def optional_section(pr, sh=None):
    """Win text for a mixed repair. None on any failure so the other stamp still runs."""
    try:
        shell = _shell(sh)
        return section_for(read_files(pr, shell), shell, pr)
    except Exception:
        return None
