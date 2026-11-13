"""Body repairs a mixed fix-red rollup can apply while another class stays on the model.

A single class returns nothing here so its primary route (changelog stamp, rerun, sync)
is not applied twice. Component-test evidence is never one of these repairs. The claim
is spent before the edit; a failed edit returns None so the model still runs this tick.
"""
from __future__ import annotations


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
    return repairs


def first_route_reason(host, pr, route, claim_route):
    """Owner handoff first, then one mixed body repair. None keeps the caller route."""
    import fix_red_failure_routing

    if reason := fix_red_failure_routing.owner_handoff_reason(route):
        return reason
    return apply_mixed_body_repairs(host, pr, route, claim_route)


def apply_mixed_body_repairs(host, pr, route, claim_route):
    if not isinstance(route, dict):
        return None
    repairs = route.get("repairs") or []
    import fix_red_classes as classes

    if classes.STAMP_CHANGELOG not in repairs and "red-before-green" not in repairs:
        return None
    if not claim_route(host, pr, "mixed-body-repairs"):
        return None
    decision = {"releaseWorthy": False} if classes.STAMP_CHANGELOG in repairs else None
    import pr_events

    if pr_events.ensure_red_before_green(pr, "", customer_decision=decision):
        return "infra-rerun:mixed-body-repairs"
    return None
