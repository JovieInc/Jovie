"""Body repairs a mixed fix-red rollup can apply while another class stays on the model.

A single class returns nothing here so its primary route (changelog stamp, rerun, sync)
is not applied twice. Component-test evidence is never one of these repairs. The claim
is spent before the edit; a failed edit returns None so the model still runs this tick.
"""
from __future__ import annotations

from atomic_state import atomic_write_text


def publish_pr_body(lane, host, pr: dict, name: str, text: str) -> bool:
    """Write a prepared body through the owning runner's existing repair client."""
    runs = host.state / "runs"
    runs.mkdir(parents=True, exist_ok=True)
    path = runs / f"{name}-{int(pr['number'])}.md"
    atomic_write_text(path, text)
    edited = lane.gh_call(["pr", "edit", str(int(pr["number"])), "--repo", lane.REPO_SLUG,
                           "--body-file", str(path)], priority="repair")
    return edited.returncode == 0


def stamp_changelog_decision(lane, host, pr: dict) -> bool:
    """Write the internal customer-changelog note onto the PR body. False when the body cannot
    take one or GitHub rejects the edit (the model then gets the head)."""
    stamped = lane.fix_red_classes.stamp_internal_changelog(pr.get("body"))
    if stamped is None:
        return False
    return lane._publish_pr_body(host, pr, "changelog", stamped)


def stamp_fleet_body(lane, host, pr: dict) -> str | None:
    """Stamp missing repair evidence once per head; a measured win stays with the model."""
    body = pr.get("body")
    if not isinstance(body, str) or lane.pr_events.red_section_complete(body):
        return None
    updated = lane.pr_events.repair_evidence_body(pr, body, "")
    if updated == body or not lane.claim_route(host, pr, lane.fix_red_classes.STAMP_REPAIR):
        return None
    return "stamped-fleet-body" if lane._publish_pr_body(host, pr, "fleet-body", updated) else None


def promote_body_and_sync(cls, action, per_check):
    """Repair body evidence beside only sync-main classes without a model.

    Body repair stays on the mixed path. The sync is the route, including when
    the branch is already BEHIND (that override would otherwise drop the body repair).
    """
    import fix_red_classes as classes

    body_classes = {"pr-body", "measured-win"}
    if not body_classes.intersection(item_cls for item_cls, _ in per_check):
        return cls, action
    rest = [item_action for item_cls, item_action in per_check if item_cls not in body_classes]
    if not rest or any(item_action != classes.SYNC_MAIN for item_action in rest):
        return cls, action
    return "mixed", classes.SYNC_MAIN


def mixed_repairs(pr: dict, per_check: list) -> list[str]:
    if len({cls for cls, _ in per_check}) < 2:
        return []
    import fix_red_classes as classes
    from pr_events import red_section_complete

    repairs: list[str] = []
    stamp = classes.STAMP_CHANGELOG
    if any(action == stamp for _, action in per_check) and classes.stamp_internal_changelog(pr.get("body")) is not None:
        repairs.append(stamp)
    if any(cls == "pr-body" for cls, _ in per_check) and not red_section_complete(str(pr.get("body") or "")):
        repairs.append("red-before-green")
    if any(action == classes.REPAIR_WIN for _, action in per_check):
        repairs.append(classes.REPAIR_WIN)
    if any(item_cls == "win-envelope" for item_cls, _ in per_check):
        repairs.append("repair-win-envelope")
    return repairs


def first_route_reason(host, pr, route, claim_route):
    """Owner handoff first, then a pin Win, then one mixed body repair. None keeps the caller route."""
    import fix_red_failure_routing

    if reason := fix_red_failure_routing.owner_handoff_reason(route):
        return reason
    if isinstance(route, dict) and route.get("action") == "repair-win":
        import fix_red_measured_win
        return fix_red_measured_win.apply(host, pr, claim_route)
    if isinstance(route, dict) and route.get("action") == "repair-win-envelope":
        import fix_red_win_envelope
        return fix_red_win_envelope.apply(host, pr, claim_route)
    return apply_mixed_body_repairs(host, pr, route, claim_route)


def apply_mixed_body_repairs(host, pr, route, claim_route):
    if not isinstance(route, dict):
        return None
    repairs = route.get("repairs") or []
    import fix_red_classes as classes

    stamp = classes.STAMP_CHANGELOG in repairs
    red = "red-before-green" in repairs
    win = classes.REPAIR_WIN in repairs
    envelope = "repair-win-envelope" in repairs
    if not (stamp or red or win or envelope):
        return None
    win_section = None
    previous_win = None
    if win:
        import fix_red_measured_win
        win_section = fix_red_measured_win.optional_section(pr)
    if envelope and win_section is None:
        import fix_red_win_envelope
        completed = fix_red_win_envelope.optional_completion(pr)
        if completed:
            win_section, previous_win = completed
    if win_section is None and not stamp and not red:
        return None
    if not claim_route(host, pr, "mixed-body-repairs"):
        return None
    decision = {"releaseWorthy": False} if stamp else None
    import pr_events

    edited = pr_events.ensure_red_before_green(
        pr, "", customer_decision=decision,
        **({} if win_section is None else {"win_section": win_section}),
        **({} if previous_win is None else {"previous_win_section": previous_win}))
    return "infra-rerun:mixed-body-repairs" if edited else None
