"""Publish a measured company-guard or GitHub Action pin Win without a model.

pin_revisions fails closed before claim_route, so a non-pin head still reaches
the model. A body edit returns infra-rerun:measured-win. An unchanged body
returns None and the model runs this tick.
"""
from __future__ import annotations

import json

import repair_win

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


def _target(files):
    try:
        old, new, cert_old = repair_win.pin_revisions(files)
        return "JovieInc/ci", old, new, cert_old, False
    except ValueError:
        repository, old, new = repair_win.github_action_revisions(files)
        return repository, old, new, None, True


def section_for(files, sh) -> str:
    repository, old, new, cert_old, action = _target(files)
    comparison = _read_json(sh, ["api", f"repos/{repository}/compare/{old}...{new}"])
    adopted = _read_json(sh, ["api", f"repos/{repository}/compare/{new}...{new}"])
    if action:
        return repair_win.github_action_pin(files, comparison, adopted_comparison=adopted)
    kwargs = {}
    if cert_old is not None:
        kwargs["certification_comparison"] = _read_json(
            sh, ["api", f"repos/JovieInc/ci/compare/{cert_old}...{new}"])
        kwargs["certification_adopted"] = _read_json(
            sh, ["api", f"repos/JovieInc/ci/compare/{new}...{new}"])
    return repair_win.company_guard_pin(files, comparison, adopted_comparison=adopted, **kwargs)


def publish(pr, sh) -> bool:
    """Fetch the pin evidence and write the Win. False when the edit does not land."""
    try:
        section = section_for(read_files(pr, sh), sh)
    except _READ_ERRORS:
        return False
    import pr_events
    try:
        return bool(pr_events.ensure_red_before_green(
            pr, win_section=section, customer_decision={"releaseWorthy": False}, sh=sh))
    except _READ_ERRORS:
        return False


def apply(host, pr, claim_route, sh=None) -> str | None:
    """Claim once after the diff is a pin bump. None leaves the head on the model."""
    shell = _shell(sh)
    try:
        files = read_files(pr, shell)
        _target(files)
    except _READ_ERRORS:
        return None
    if not claim_route(host, pr, ACTION):
        return None
    try:
        section = section_for(files, shell)
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
        return section_for(read_files(pr, shell), shell)
    except Exception:
        return None
